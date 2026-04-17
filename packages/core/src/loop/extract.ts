/**
 * Shared utilities for extracting JSON and text from Claude message content.
 * Used by both planner.ts and brief-preprocessor.ts.
 */

/** Strip code fences and extract the outermost JSON object or array. */
export function extractJson(raw: string): string {
  const candidates = extractJsonCandidates(raw);

  for (const candidate of candidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return stripJsonFences(raw);
}

/** Strip code fences and return balanced JSON object/array candidates in source order. */
export function extractJsonCandidates(raw: string): string[] {
  const stripped = stripJsonFences(raw);
  return findJsonCandidates(stripped);
}

function stripJsonFences(raw: string): string {
  return raw.replace(/```(?:json)?\r?\n?/gi, '').replace(/```/g, '').trim();
}

function findJsonCandidates(raw: string): string[] {
  const candidates: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '{' && ch !== '[') continue;

    const candidate = extractBalancedJson(raw, i);
    if (candidate === undefined) continue;

    candidates.push(candidate.value);
    i = candidate.end - 1;
  }

  return candidates;
}

function extractBalancedJson(raw: string, start: number): { value: string; end: number } | undefined {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }

    if (ch !== '}' && ch !== ']') continue;

    const open = stack.pop();
    if (open === undefined) return undefined;

    const matches = (open === '{' && ch === '}') || (open === '[' && ch === ']');
    if (!matches) return undefined;

    if (stack.length === 0) {
      return {
        value: raw.slice(start, i + 1),
        end: i + 1,
      };
    }
  }

  return undefined;
}

/** Extract plain text from a Claude message content block array or raw string. */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  return (content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}
