import { createRequire as createNodeRequire } from 'module';
import type { StatementSync } from 'node:sqlite';

const nodeRequire = createNodeRequire(import.meta.url);

type DatabaseConnection = import('node:sqlite').DatabaseSync;

const sqliteModule = nodeRequire('node:sqlite') as {
  DatabaseSync: new (location: string) => DatabaseConnection;
};

export const DatabaseSyncCtor = sqliteModule.DatabaseSync;
export type { DatabaseConnection, StatementSync };
