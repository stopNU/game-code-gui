import type { DatabaseConnection, StatementSync } from '../sqlite.js';

interface SettingRow {
  key: string;
  value: string;
}

export interface SettingRecord {
  key: string;
  value: string;
}

export class SettingsRepository {
  private readonly getStatement: StatementSync;
  private readonly setStatement: StatementSync;
  private readonly deleteStatement: StatementSync;

  public constructor(private readonly db: DatabaseConnection) {
    this.getStatement = db.prepare('SELECT * FROM settings WHERE key = ?');
    this.setStatement = db.prepare(
      `
        INSERT INTO settings (key, value)
        VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
    );
    this.deleteStatement = db.prepare('DELETE FROM settings WHERE key = ?');
  }

  public get(key: string): SettingRecord | null {
    const row = this.getStatement.get(key) as SettingRow | undefined;
    return row === undefined ? null : row;
  }

  public set(key: string, value: string): SettingRecord {
    this.setStatement.run({ key, value });
    const setting = this.get(key);
    if (setting === null) {
      throw new Error(`Failed to persist setting ${key}.`);
    }

    return setting;
  }

  public delete(key: string): void {
    this.deleteStatement.run(key);
  }
}
