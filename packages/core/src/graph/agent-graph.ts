import { StateGraph, MessagesAnnotation, END } from '@langchain/langgraph';
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { StructuredTool } from '@langchain/core/tools';
import { createChatModel } from './models.js';
import type { AgentRole, ModelId } from '../types/agent.js';

export interface AgentGraphOptions {
  role: AgentRole;
  model: ModelId | string;
  systemPrompt: string;
  tools: StructuredTool[];
  maxIterations?: number;
}

export interface CompiledAgentGraph {
  stream(
    input: { messages: BaseMessage[] },
    options?: { signal?: AbortSignal; runName?: string; tags?: string[] },
  ): AsyncIterable<Record<string, unknown>>;
  invoke(
    input: { messages: BaseMessage[] },
    options?: { signal?: AbortSignal; runName?: string },
  ): Promise<{ messages: BaseMessage[] }>;
}

/**
 * Build and compile a LangGraph ReAct agent.
 *
 * For Codex providers the tools node is omitted (the underlying
 * SDK handles tool use internally).
 */
export function createAgentGraph(opts: AgentGraphOptions): CompiledAgentGraph {
  const chatModel = createChatModel(opts.model, opts.role);
  const isAutonomousProvider = opts.model === 'gpt-5.4';

  if (isAutonomousProvider || opts.tools.length === 0) {
    return buildSimpleGraph(chatModel, opts.systemPrompt, opts.maxIterations);
  }

  return buildReActGraph(chatModel, opts.tools, opts.systemPrompt, opts.maxIterations);
}

function buildReActGraph(
  chatModel: BaseChatModel,
  tools: StructuredTool[],
  systemPrompt: string,
  maxIterations = 60,
): CompiledAgentGraph {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelWithTools = (chatModel as any).bindTools(tools);
  const toolNode = new ToolNode(tools);
  let iteration = 0;

  const agentNode = async (state: typeof MessagesAnnotation.State) => {
    iteration++;
    if (iteration > maxIterations) {
      return { messages: [new AIMessage(`Agent hit max iterations (${maxIterations}).`)] };
    }

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...state.messages,
    ];

    const response = await modelWithTools.invoke(messages);
    return { messages: [response] };
  };

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'agent')
    .addConditionalEdges('agent', toolsCondition)
    .addEdge('tools', 'agent');

  return graph.compile() as unknown as CompiledAgentGraph;
}

function buildSimpleGraph(
  chatModel: BaseChatModel,
  systemPrompt: string,
  maxIterations = 60,
): CompiledAgentGraph {
  let iteration = 0;

  const agentNode = async (state: typeof MessagesAnnotation.State) => {
    iteration++;
    if (iteration > maxIterations) {
      return { messages: [new AIMessage(`Agent hit max iterations (${maxIterations}).`)] };
    }

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...state.messages,
    ];

    const response = await chatModel.invoke(messages);
    return { messages: [response] };
  };

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', agentNode)
    .addEdge('__start__', 'agent')
    .addEdge('agent', END);

  return graph.compile() as unknown as CompiledAgentGraph;
}

export { HumanMessage, AIMessage, SystemMessage, ToolMessage };
