import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { openStudioDatabase } from './index.js';
import { readPragmaValue } from './migration-runner.js';
import { normalizePath } from './normalize-path.js';
import { ProjectScanner } from '../services/project-scanner.js';
import { Base64SecretStorage } from '../services/secret-storage.js';
import { SettingsService } from '../services/settings-service.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'studio-phase-2-'));
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

describe('studio phase 2 database', () => {
  it('boots the database with the initial migration and pragmas', () => {
    const tempDir = createTempDir();
    const database = openStudioDatabase(path.join(tempDir, 'studio.sqlite3'));

    expect(readPragmaValue(database.db, 'user_version')).toBe(2);
    expect(readPragmaValue(database.db, 'journal_mode')).toBe('wal');
    expect(readPragmaValue(database.db, 'foreign_keys')).toBe(1);

    database.close();
  });

  it('lists only workspace projects that have persisted task plans', () => {
    const tempDir = createTempDir();
    const workspaceRoot = path.join(tempDir, 'workspace');
    const projectDir = path.join(workspaceRoot, 'cat-deck');
    const externalProjectDir = path.join(tempDir, 'external', 'ghost-run');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(externalProjectDir, { recursive: true });

    const database = openStudioDatabase(path.join(tempDir, 'studio.sqlite3'));
    const localProject = database.projects.upsert({
      normalizedPath: normalizePath(projectDir),
      displayPath: projectDir,
      title: 'Slay the Cats',
    });
    database.taskPlans.upsert({
      projectId: localProject.id,
      planJson: JSON.stringify({
        gameTitle: 'Slay the Cats',
        phases: [
          {
            tasks: [
              { id: 'p1', title: 'Scaffold', status: 'complete' },
              { id: 'p2', title: 'Combat', status: 'pending' },
            ],
          },
        ],
      }),
    });

    const externalProject = database.projects.upsert({
      normalizedPath: normalizePath(externalProjectDir),
      displayPath: externalProjectDir,
      title: 'Ghost Run',
    });
    database.taskPlans.upsert({
      projectId: externalProject.id,
      planJson: JSON.stringify({
        gameTitle: 'Ghost Run',
        phases: [{ tasks: [{ id: 'x1', title: 'External', status: 'complete' }] }],
      }),
    });

    const scanner = new ProjectScanner(database.projects, database.taskPlans);
    const projects = scanner.list(workspaceRoot);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: localProject.id,
      name: 'Slay the Cats',
      taskCount: 2,
      completeCount: 1,
      status: 'ready',
    });

    database.close();
  });

  it('encrypts and decrypts stored API keys through the settings service', () => {
    const tempDir = createTempDir();
    const database = openStudioDatabase(path.join(tempDir, 'studio.sqlite3'));
    const settingsService = new SettingsService(database.settings, new Base64SecretStorage(), tempDir);

    settingsService.setApiKey('anthropic', 'secret-key');

    expect(database.settings.get('secret.anthropic_api_key')?.value).not.toBe('secret-key');
    expect(settingsService.getApiKey('anthropic')).toBe('secret-key');

    database.close();
  });

  it('creates and reads persisted conversations', () => {
    const tempDir = createTempDir();
    const database = openStudioDatabase(path.join(tempDir, 'studio.sqlite3'));

    const conversation = database.conversations.create({
      title: 'Build Phase 2',
      provider: 'anthropic',
    });

    const listed = database.conversations.list();

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: conversation.id,
      title: 'Build Phase 2',
      provider: 'anthropic',
    });

    database.close();
  });
});
