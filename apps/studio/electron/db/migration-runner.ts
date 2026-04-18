import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { DatabaseConnection } from './sqlite.js';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

export function readPragmaValue(db: DatabaseConnection, pragmaName: string): string | number | null {
  const row = db.prepare(`PRAGMA ${pragmaName}`).get() as Record<string, string | number> | undefined;
  if (row === undefined) {
    return null;
  }

  const [value] = Object.values(row);
  return value ?? null;
}

export function runMigrations(db: DatabaseConnection): void {
  const currentVersion = Number(readPragmaValue(db, 'user_version') ?? 0);
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  for (const fileName of migrationFiles) {
    const version = Number.parseInt(fileName.split('_')[0] ?? '', 10);
    if (!Number.isFinite(version) || version <= currentVersion) {
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, fileName), 'utf8');
    db.exec(sql);
    db.exec(`PRAGMA user_version = ${version}`);
  }
}
