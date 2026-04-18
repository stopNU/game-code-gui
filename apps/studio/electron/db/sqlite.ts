import { createRequire } from 'module';
import type { StatementSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

type DatabaseConnection = import('node:sqlite').DatabaseSync;

const sqliteModule = require('node:sqlite') as {
  DatabaseSync: new (location: string) => DatabaseConnection;
};

export const DatabaseSyncCtor = sqliteModule.DatabaseSync;
export type { DatabaseConnection, StatementSync };
