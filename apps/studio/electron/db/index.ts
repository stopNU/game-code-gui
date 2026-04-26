import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DatabaseSyncCtor, type DatabaseConnection } from './sqlite.js';
import { runMigrations } from './migration-runner.js';
import { ApprovalsRepository } from './repositories/approvals-repository.js';
import { ConversationsRepository } from './repositories/conversations-repository.js';
import { ProjectsRepository } from './repositories/projects-repository.js';
import { SettingsRepository } from './repositories/settings-repository.js';
import { TaskPlansRepository } from './repositories/task-plans-repository.js';
import { ConversationTokensRepository } from './repositories/conversation-tokens-repository.js';

export interface StudioDatabase {
  db: DatabaseConnection;
  dbPath: string;
  approvals: ApprovalsRepository;
  conversations: ConversationsRepository;
  conversationTokens: ConversationTokensRepository;
  projects: ProjectsRepository;
  settings: SettingsRepository;
  taskPlans: TaskPlansRepository;
  close: () => void;
}

export function openStudioDatabase(dbPath: string): StudioDatabase {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSyncCtor(dbPath);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  runMigrations(db);

  return {
    db,
    dbPath,
    approvals: new ApprovalsRepository(db),
    conversations: new ConversationsRepository(db),
    conversationTokens: new ConversationTokensRepository(db),
    projects: new ProjectsRepository(db),
    settings: new SettingsRepository(db),
    taskPlans: new TaskPlansRepository(db),
    close: () => {
      db.close();
    },
  };
}
