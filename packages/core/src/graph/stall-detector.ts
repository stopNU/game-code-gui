/** Stall detection logic lifted from the agent loop. */

const MAX_IDENTICAL_TOOL_CALLS = 3;
const MAX_CALLS_WITHOUT_WRITE_PRE = 16;
const MAX_CALLS_WITHOUT_WRITE_POST = 8;

export interface StallState {
  callsSinceLastWrite: number;
  totalWrites: number;
  typechecksSinceLastWrite: number;
  repeatedToolCalls: Map<string, number>;
}

export function createStallState(): StallState {
  return {
    callsSinceLastWrite: 0,
    totalWrites: 0,
    typechecksSinceLastWrite: 0,
    repeatedToolCalls: new Map(),
  };
}

export interface StallCheckResult {
  stalled: boolean;
  reason?: string;
}

export function checkRepeatStall(
  toolName: string,
  toolInput: Record<string, unknown>,
  state: StallState,
): StallCheckResult {
  const key = `${toolName}:${stableStringify(toolInput)}`;
  const count = (state.repeatedToolCalls.get(key) ?? 0) + 1;
  state.repeatedToolCalls.set(key, count);

  if (count >= MAX_IDENTICAL_TOOL_CALLS) {
    return {
      stalled: true,
      reason: `Repeated tool call detected for "${toolName}". Choose a different action or explain why the previous result was insufficient.`,
    };
  }

  return { stalled: false };
}

export function checkWriteStall(
  toolName: string,
  state: StallState,
): StallCheckResult {
  state.callsSinceLastWrite++;

  const threshold =
    state.totalWrites === 0 ? MAX_CALLS_WITHOUT_WRITE_PRE : MAX_CALLS_WITHOUT_WRITE_POST;

  if (state.callsSinceLastWrite >= threshold) {
    const hint =
      state.totalWrites === 0
        ? 'The agent gathered context but never wrote a file. Re-run; it may need clearer relevantFiles.'
        : 'The agent wrote files but then stalled in a read loop. Re-run; it likely needs to patch rather than re-read.';
    return {
      stalled: true,
      reason: `Agent stalled — ${state.callsSinceLastWrite} consecutive tool calls with no file writes (threshold: ${threshold}, writes so far: ${state.totalWrites}). Last tool: "${toolName}". ${hint}`,
    };
  }

  return { stalled: false };
}

export function recordToolWrite(toolName: string, state: StallState): void {
  const isWrite =
    toolName.includes('write') ||
    toolName.includes('patch') ||
    toolName.includes('create');

  if (isWrite) {
    state.callsSinceLastWrite = 0;
    state.typechecksSinceLastWrite = 0;
    state.totalWrites++;
  }
}

export function checkTypecheckStall(
  toolName: string,
  toolInput: Record<string, unknown>,
  state: StallState,
): StallCheckResult {
  const isTypecheck =
    toolName === 'npm__runScript' &&
    typeof toolInput['script'] === 'string' &&
    (toolInput['script'] as string).includes('typecheck');

  if (!isTypecheck) return { stalled: false };

  state.typechecksSinceLastWrite++;
  if (state.typechecksSinceLastWrite >= 3) {
    return {
      stalled: true,
      reason: `Typecheck loop detected — typecheck ran ${state.typechecksSinceLastWrite} times without a successful write. Run \`tsc --noEmit\` manually and fix the remaining errors.`,
    };
  }

  return { stalled: false };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}
