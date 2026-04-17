/**
 * Shared building blocks for all role system prompts.
 *
 * Structure for each role:
 *   (a) IDENTITY  — concise role identity, ~5 lines; stable, cached first
 *   (b) FEW_SHOT  — concrete example(s) of correct output (role-dependent)
 *   (c) RULES_*   — domain-specific rule blocks, injected conditionally
 *
 * Compose with buildPrompt(...sections) which joins non-empty sections with
 * a --- separator, making it easy to A/B test individual blocks.
 */

/** Closing line appended to every prompt — appears after all rule blocks. */
export const SHARED_DISCIPLINE =
  'Always complete tasks with the minimum code necessary. Do not add features not in the acceptance criteria.';

/**
 * Token-budget workflow rules injected into every role prompt.
 * Prevents the "read everything first" pattern that exhausts the budget before any files are written.
 */
export const SHARED_WORKFLOW = `## Task execution workflow

**Read the minimum. Write immediately. Keep writing.**

1. Know what files you must produce from the brief and acceptance criteria before reading anything.
2. Read only files in relevantFiles or files you will directly edit — never speculatively.
3. Write the first output file as soon as you know its content; do not wait until all context is read.
4. Once writing, keep writing. Read more only if a compile error forces it.
5. Run typecheck after each batch of related files, not at the very end.
6. Never re-read a file already read this session.

Stop reading and start writing immediately if you have read 5+ files and written nothing, or are about to read a file not imported by what you are writing.

For scaffold/new-file tasks: write directly from the brief and schemas — do not read existing source files unless you need to match an exported interface.`;

/**
 * Join non-empty sections with a `---` divider.
 * SHARED_WORKFLOW is automatically injected after the first (identity) section
 * so every role gets token-budget and workflow discipline without each prompt
 * needing to import and place it manually.
 * Accepts any number of optional string arguments; undefined/empty values are skipped.
 */
export function buildPrompt(...sections: Array<string | undefined>): string {
  const filled = sections.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  if (filled.length === 0) return '';
  // Insert SHARED_WORKFLOW after the identity block (index 0), before domain rules
  const [identity, ...rest] = filled;
  return [identity!, SHARED_WORKFLOW, ...rest]
    .join('\n\n---\n\n');
}
