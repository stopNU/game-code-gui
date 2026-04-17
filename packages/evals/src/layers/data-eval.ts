import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { EvalContext, EvalResult, EvalViolation } from '../types/scenario.js';

export async function runDataEval(ctx: EvalContext): Promise<EvalResult> {
  const violations: EvalViolation[] = [];

  // Godot project content path: src/data/content/
  const contentDir = join(ctx.projectPath, 'src', 'data', 'content');

  const contentFiles: string[] = [];
  if (existsSync(contentDir)) {
    const entries = await readdir(contentDir);
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        contentFiles.push(join(contentDir, entry));
      }
    }
  } else {
    violations.push({
      file: contentDir,
      issue: 'Content directory does not exist (expected src/data/content/)',
      severity: 'error',
    });
  }

  // Validate each content file
  for (const filePath of contentFiles) {
    let parsed: unknown;
    try {
      const raw = await readFile(filePath, 'utf8');
      parsed = JSON.parse(raw);
    } catch {
      violations.push({
        file: filePath,
        issue: 'File is not valid JSON',
        severity: 'error',
      });
      continue;
    }

    if (!Array.isArray(parsed)) {
      violations.push({
        file: filePath,
        issue: 'Content file is not an array',
        severity: 'error',
      });
      continue;
    }

    if (parsed.length < 1) {
      violations.push({
        file: filePath,
        issue: 'Content array is empty',
        severity: 'error',
      });
      continue;
    }

    if (parsed.length < 3) {
      violations.push({
        file: filePath,
        issue: `Content array has only ${parsed.length} entries (minimum 3 recommended)`,
        severity: 'warning',
      });
    }

    // Check each entry for required fields and duplicates
    const seenIds = new Set<string>();
    let missingArtPrompt = 0;

    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i] as Record<string, unknown>;
      if (typeof entry !== 'object' || entry === null) {
        violations.push({ file: filePath, issue: `Entry at index ${i} is not an object`, severity: 'error' });
        continue;
      }

      if (typeof entry['id'] !== 'string') {
        violations.push({ file: filePath, issue: `Entry at index ${i} missing string 'id' field`, severity: 'error' });
        continue;
      }

      const id = entry['id'];
      if (seenIds.has(id)) {
        violations.push({ file: filePath, issue: `Duplicate id '${id}'`, severity: 'error' });
      } else {
        seenIds.add(id);
      }

      // artPrompt is required on every entry
      if (typeof entry['artPrompt'] !== 'string' || entry['artPrompt'] === '') {
        missingArtPrompt++;
      }
    }

    if (missingArtPrompt > 0) {
      violations.push({
        file: filePath,
        issue: `${missingArtPrompt}/${parsed.length} entries missing non-empty 'artPrompt' field`,
        severity: 'warning',
      });
    }
  }

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const rawScore = errorCount > 0
    ? Math.max(0, 5 - (errorCount - 1) - warningCount * 0.5)
    : 10.0 - warningCount * 0.5;
  const score = Math.max(0, rawScore);
  const passed = errorCount === 0 && score >= 6;

  const summary = violations.length === 0
    ? `All ${contentFiles.length} content file(s) passed validation`
    : `${errorCount} error(s) and ${warningCount} warning(s) across ${contentFiles.length} content file(s)`;

  return {
    layerName: 'data',
    score,
    passed,
    violations,
    summary,
  };
}
