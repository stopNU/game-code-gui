export function serializeContentBlocks(contentBlocks: unknown[]): string {
  return contentBlocks
    .map((block) => {
      if (!isRecord(block) || typeof block['type'] !== 'string') {
        return '';
      }

      if (block['type'] === 'text' && typeof block['text'] === 'string') {
        return block['text'];
      }

      if (block['type'] === 'tool_use') {
        const name = typeof block['name'] === 'string' ? block['name'] : 'tool';
        const input = 'input' in block ? stringifyJson(block['input']) : '';
        return [`Requested tool: \`${name}\``, input.length > 0 ? `\n\`\`\`json\n${input}\n\`\`\`` : ''].join('\n');
      }

      if (block['type'] === 'tool_result') {
        const content = typeof block['content'] === 'string' ? block['content'] : stringifyJson(block['content']);
        return [`Tool result`, content.length > 0 ? `\n\`\`\`\n${content}\n\`\`\`` : ''].join('\n');
      }

      return stringifyJson(block);
    })
    .filter((part) => part.length > 0)
    .join('\n\n');
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
