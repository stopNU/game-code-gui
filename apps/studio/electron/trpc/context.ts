import type { SessionManager } from '../services/session-manager.js';
import type { StudioDatabase } from '../db/index.js';
import type { ProjectScanner } from '../services/project-scanner.js';
import type { SettingsService } from '../services/settings-service.js';

export interface TrpcContext {
  sessionManager: SessionManager;
  workspaceRoot: string;
  database: StudioDatabase;
  projectScanner: ProjectScanner;
  settingsService: SettingsService;
}
