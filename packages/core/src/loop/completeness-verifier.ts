import { readFile } from 'fs/promises';
import { isAbsolute, join } from 'path';

/**
 * Completeness verifier — runs when the agent loop thinks a task is done
 * (model stopped calling tools) and confirms the files it touched are not
 * still template stubs.
 *
 * Pairs with the assert-stub forcing functions in templates/deckbuilder/src/
 * scenes/* and systems/*. Both layers are intentional defence-in-depth:
 *
 * - The runtime asserts halt the playtest if a stub is reached.
 * - This static check catches stubs *before* a playtest is even attempted,
 *   so the agent gets immediate feedback rather than discovering a stub
 *   half an hour later when the harness times out.
 *
 * Pure logic + a thin file-read wrapper so it's easy to unit-test.
 */

export interface CompletenessIssue {
  filePath: string;
  reason: string;
}

export interface CompletenessResult {
  passed: boolean;
  issues: CompletenessIssue[];
}

/**
 * Substrings that indicate a file is still in template-stub state. Kept in
 * sync with the stub bodies written by the deckbuilder template scaffold —
 * see templates/deckbuilder/src/scenes/*.gd and src/systems/*.gd.
 *
 * The textual marker is intentionally redundant with the runtime assert: a
 * partial implementation that removes the assert but forgets the leading
 * `## TODO: implement` is still caught here.
 */
const STUB_TEXT_MARKERS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /STUB — must be replaced/,
    reason: 'still contains the template "STUB — must be replaced" docstring',
  },
  {
    pattern: /is a stub — implement before/,
    reason: 'still contains the template assert("… is a stub …") line',
  },
  {
    pattern: /push_error\(\s*"\[stub\]/,
    reason: 'still contains the template push_error("[stub] …") line',
  },
  {
    pattern: /^## TODO: implement\b/m,
    reason: 'still starts with "## TODO: implement" — file looks unfilled',
  },
];

/**
 * Per-file-type minimum line counts. A scene script with 8 lines is
 * almost certainly the 5-line stub plus 3 lines of edits, not a real
 * implementation.
 *
 * Conservative floors. If the agent legitimately writes a tiny file, it
 * should be a config or shared util, not under scenes/systems/autoload.
 */
/**
 * Path-based dispatch for the per-file-type floor. Substring-matched against
 * a normalised (forward-slash) version of the file path so backslash paths
 * from Windows tool output are handled too.
 */
const MIN_LINES_BY_PATTERN: ReadonlyArray<{ contains: string; minLines: number; label: string }> = [
  { contains: 'src/scenes/', minLines: 30, label: 'scene script' },
  { contains: 'src/systems/', minLines: 20, label: 'system script' },
  { contains: 'src/autoload/', minLines: 15, label: 'autoload script' },
];

function normaliseSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

export type FileReader = (absPath: string) => Promise<string>;

const defaultReader: FileReader = (p) => readFile(p, 'utf8');

/**
 * Inspect `filesModified` for stub markers and obvious size red flags.
 *
 * Files that don't look like .gd code under src/scenes, src/systems, or
 * src/autoload are skipped — content JSON, schema files, asset PNGs, etc.
 * Those are validated by other layers (data eval, asset pipeline).
 *
 * @param projectPath  Absolute project root, used to resolve relative paths.
 * @param filesModified  Paths the agent wrote during the task. Either
 *   absolute or project-relative; resolved against `projectPath`.
 * @param reader  Injectable for tests; defaults to `fs.readFile`.
 */
export async function verifyCompleteness(
  projectPath: string,
  filesModified: ReadonlyArray<string>,
  reader: FileReader = defaultReader,
): Promise<CompletenessResult> {
  const issues: CompletenessIssue[] = [];
  const seen = new Set<string>();

  for (const rel of filesModified) {
    if (!rel.endsWith('.gd')) continue;
    if (seen.has(rel)) continue;
    seen.add(rel);

    const norm = normaliseSlashes(rel);
    const checkable = MIN_LINES_BY_PATTERN.find((p) => norm.includes(p.contains));
    if (!checkable) continue;

    // Normalise to forward slashes — fs.readFile accepts them on Windows,
    // and downstream reporting / test fixtures stay platform-independent.
    const abs = normaliseSlashes(isAbsolute(rel) ? rel : join(projectPath, rel));
    let content: string;
    try {
      content = await reader(abs);
    } catch {
      // File was deleted or unreadable — not a stub, skip.
      continue;
    }

    let textIssue: CompletenessIssue | undefined;
    for (const { pattern, reason } of STUB_TEXT_MARKERS) {
      if (pattern.test(content)) {
        textIssue = { filePath: rel, reason };
        break;
      }
    }
    if (textIssue) {
      issues.push(textIssue);
      continue;
    }

    const lineCount = content.split('\n').length;
    if (lineCount < checkable.minLines) {
      issues.push({
        filePath: rel,
        reason: `${checkable.label} has only ${lineCount} lines (min ${checkable.minLines}) — looks unfilled`,
      });
    }
  }

  return { passed: issues.length === 0, issues };
}

/**
 * Format a list of completeness issues into a re-prompt the agent can act
 * on. Used by the agent loop when verification fails and there's still
 * retry budget.
 */
export function formatCompletenessReprompt(issues: ReadonlyArray<CompletenessIssue>): string {
  const lines = issues.map((i) => `- ${i.filePath}: ${i.reason}`).join('\n');
  return [
    'The task is not complete. The following files you modified still look like template stubs:',
    '',
    lines,
    '',
    'For each file: replace the entire body — including the leading `## TODO: implement` comment, the "STUB — must be replaced" docstring, the `push_error("[stub] …")` line, and the `assert(false, "… is a stub …")` line. Implement what the task asks for, or — if a file is genuinely outside this task\'s scope — leave it untouched (revert your edits) so the next task can pick it up.',
    '',
    'Use the project tools to fix the files and try again.',
  ].join('\n');
}
