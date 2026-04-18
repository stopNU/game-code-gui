export type SpanRunType = 'chain' | 'tool' | 'llm';

export interface TurnInputs {
  conversationId: string;
  model: string;
}

export interface TurnOutputs {
  status: 'complete' | 'aborted' | 'error';
  tokens: { input: number; output: number; cached: number };
}

export interface ToolInputs {
  input: unknown;
}

export interface ToolOutputs {
  result: unknown;
}
