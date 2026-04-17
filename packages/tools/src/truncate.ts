/**
 * Shared truncation helpers for tool outputs.
 * All limits are intentionally conservative — tool results are re-sent in
 * every API call that falls within the history window.
 */

/** Max lines returned by a single readFile call. */
export const READ_MAX_LINES = 200;

/** Max lines kept from the *tail* of script stdout / stderr. */
export const SCRIPT_OUTPUT_MAX_LINES = 150;

/** Max lines kept from a git diff. */
export const DIFF_MAX_LINES = 200;

/**
 * Returns `lines` with a leading `[... N lines above not shown ...]` and / or
 * trailing `[... N lines below not shown — use startLine/endLine to read more]`
 * banner when the file was clipped.
 *
 * Lines are prefixed with 1-based line numbers padded to the width of
 * `totalLines` so the agent can reference them precisely in patch calls.
 */
export function formatLines(
  lines: string[],
  startLine: number,
  totalLines: number,
): string {
  const endLine = startLine + lines.length - 1;
  const pad = String(totalLines).length;

  const numbered = lines
    .map((l, i) => `${String(startLine + i).padStart(pad, ' ')}: ${l}`)
    .join('\n');

  const above = startLine > 1 ? `[... ${startLine - 1} lines above not shown ...]\n` : '';
  const below =
    endLine < totalLines
      ? `\n[... ${totalLines - endLine} lines below not shown — use startLine/endLine to read more]`
      : '';

  return `${above}${numbered}${below}`;
}

/**
 * Truncate a block of text to at most `maxLines` lines, keeping the *tail*
 * (most recent output). Prepends a banner when clipped.
 */
export function truncateTail(text: string, maxLines: number): { text: string; truncated: boolean } {
  if (!text) return { text, truncated: false };
  const lines = text.split('\n');
  if (lines.length <= maxLines) return { text, truncated: false };
  const kept = lines.slice(lines.length - maxLines);
  const omitted = lines.length - maxLines;
  return {
    text: `[... ${omitted} lines omitted ...]\n${kept.join('\n')}`,
    truncated: true,
  };
}
