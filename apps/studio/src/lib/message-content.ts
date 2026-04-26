export interface SplitMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  status: 'streaming' | 'complete';
}

export function splitContentBlocksIntoMessages(args: {
  baseId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  contentBlocks: unknown;
  createdAt: string;
  status?: 'streaming' | 'complete';
}): SplitMessage[] {
  const { baseId, conversationId, role, createdAt } = args;
  const status = args.status ?? 'complete';
  const blocks = normalizeBlocks(args.contentBlocks);
  const result: SplitMessage[] = [];

  blocks.forEach((block, index) => {
    if (!isRecord(block) || typeof block['type'] !== 'string') {
      return;
    }

    const id = `${baseId}-${index}`;

    if (block['type'] === 'text' && typeof block['text'] === 'string') {
      const text = block['text'];
      if (text.length === 0) {
        return;
      }
      result.push({ id, conversationId, role, content: text, createdAt, status });
      return;
    }

    if (block['type'] === 'tool_use') {
      const name = typeof block['name'] === 'string' ? block['name'] : 'tool';
      const input = 'input' in block ? stringifyJson(block['input']) : '';
      const content = `**Requested tool:** \`${name}\`${input.length > 0 ? `\n\n\`\`\`json\n${input}\n\`\`\`` : ''}`;
      result.push({ id, conversationId, role: 'assistant', content, createdAt, status });
      return;
    }

    if (block['type'] === 'tool_result') {
      const raw = typeof block['content'] === 'string' ? block['content'] : stringifyJson(block['content']);
      const content = `**Tool result**${raw.length > 0 ? `\n\n\`\`\`\n${raw}\n\`\`\`` : ''}`;
      result.push({ id, conversationId, role: 'system', content, createdAt, status });
      return;
    }
  });

  return result;
}

function normalizeBlocks(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    return [{ type: 'text', text: value }];
  }
  return [];
}

export function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
