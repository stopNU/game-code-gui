import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioLoggerService } from './studio-logger.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'studio-logger-'));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe('StudioLoggerService', () => {
  it('writes structured log lines to the configured file', () => {
    const tempDir = createTempDir();
    const logFilePath = path.join(tempDir, 'studio.log');
    const logger = new StudioLoggerService(logFilePath, false);

    logger.child({ process: 'main', service: 'test' }).info({ phase: 7 }, 'phase seven log entry');

    const contents = readFileSync(logFilePath, 'utf8');
    expect(contents).toContain('phase seven log entry');
    expect(contents).toContain('"process":"main"');
  });

  it('keeps raw agent lines in the shared log file', () => {
    const tempDir = createTempDir();
    const logFilePath = path.join(tempDir, 'studio.log');
    const logger = new StudioLoggerService(logFilePath, false);

    logger.writeRawLine('{"level":30,"process":"agent","msg":"connected"}');

    const contents = readFileSync(logFilePath, 'utf8');
    expect(contents).toContain('"process":"agent"');
    expect(contents).toContain('"msg":"connected"');
  });
});
