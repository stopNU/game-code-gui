import type { SessionManager } from '../services/session-manager.js';
import type { StudioDatabase } from '../db/index.js';
import type { ProjectScanner } from '../services/project-scanner.js';
import type { SettingsService } from '../services/settings-service.js';
import type { GodotManager } from '../services/godot-manager.js';
import type { StudioUpdateState } from '../../shared/domain.js';

export interface TrpcContext {
  sessionManager: SessionManager;
  workspaceRoot: string;
  database: StudioDatabase;
  projectScanner: ProjectScanner;
  settingsService: SettingsService;
  godotManager: GodotManager;
  logFilePath: string;
  openLogFile: () => Promise<void>;
  installDownloadedUpdate: () => boolean;
  getUpdateState: () => StudioUpdateState;
  appVersion: string;
  isPackaged: boolean;
}
