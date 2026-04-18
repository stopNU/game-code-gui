import { join } from 'path';
import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { StudioUpdateState } from '../shared/domain.js';
import { openStudioDatabase } from './db/index.js';
import { ProjectScanner } from './services/project-scanner.js';
import { ElectronSafeStorageSecretStorage } from './services/secret-storage.js';
import { SettingsService } from './services/settings-service.js';
import { GodotManager } from './services/godot-manager.js';
import { StudioLoggerService } from './services/studio-logger.js';
import { appRouter } from './trpc/router.js';
import { SessionManager } from './services/session-manager.js';
import type { TrpcContext } from './trpc/context.js';

type TrpcRequest = {
  path: string;
  input: unknown;
  type: 'query' | 'mutation' | 'subscription';
};

const workspaceRoot = process.cwd();

let browserWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;
let database = openStudioDatabase(join(app.getPath('userData'), 'studio.sqlite3'));
let settingsService = new SettingsService(database.settings, new ElectronSafeStorageSecretStorage(), workspaceRoot);
let projectScanner = new ProjectScanner(database.projects, database.taskPlans);
let godotManager: GodotManager | null = null;
let logger: StudioLoggerService | null = null;
let updateState: StudioUpdateState = {
  status: 'disabled',
  message: 'Updates only run in packaged builds.',
};

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#0b1018',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:;",
        ],
      },
    });
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl !== undefined) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(join(__dirname, '../../dist/index.html'));
  }

  window.webContents.on('did-finish-load', () => {
    sessionManager?.attachRenderer();
  });

  return window;
}

function getContext(): TrpcContext {
  if (sessionManager === null) {
    throw new Error('Session manager is not ready.');
  }
  if (logger === null) {
    throw new Error('Studio logger is not ready.');
  }

  return {
    sessionManager,
    workspaceRoot,
    database,
    projectScanner,
    settingsService,
    godotManager: mustGetGodotManager(),
    logFilePath: logger.getLogFilePath(),
    openLogFile: async () => {
      shell.showItemInFolder(logger!.getLogFilePath());
    },
    installDownloadedUpdate: () => {
      if (updateState.status !== 'downloaded') {
        return false;
      }

      autoUpdater.quitAndInstall();
      return true;
    },
    getUpdateState: () => updateState,
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
  };
}

function mustGetGodotManager(): GodotManager {
  if (godotManager === null) {
    throw new Error('Godot manager is not ready.');
  }

  return godotManager;
}

async function invokeTrpc(request: TrpcRequest): Promise<unknown> {
  if (request.type === 'subscription') {
    throw new Error('Subscriptions are not supported in studio IPC.');
  }

  const caller = appRouter.createCaller(getContext()) as Record<string, unknown>;
  let target: unknown = caller;

  for (const segment of request.path.split('.')) {
    if (typeof target !== 'object' || target === null || !(segment in target)) {
      throw new Error(`Unknown tRPC path: ${request.path}`);
    }
    target = (target as Record<string, unknown>)[segment];
  }

  if (typeof target !== 'function') {
    throw new Error(`Path is not callable: ${request.path}`);
  }

  return await (target as (input: unknown) => Promise<unknown> | unknown)(request.input);
}

function emitUpdateState(nextState: StudioUpdateState): void {
  updateState = nextState;
  sessionManager?.emitStreamEvent({
    type: 'update-status',
    status: nextState.status,
    ...(nextState.version !== undefined ? { version: nextState.version } : {}),
    ...(nextState.downloadedVersion !== undefined ? { downloadedVersion: nextState.downloadedVersion } : {}),
    ...(nextState.message !== undefined ? { message: nextState.message } : {}),
  });
}

function configureAutoUpdates(): void {
  if (logger === null) {
    return;
  }

  const appLogger = logger.child({ process: 'main', service: 'updater' });
  if (!app.isPackaged) {
    emitUpdateState({
      status: 'disabled',
      message: 'Auto-update checks are disabled in development builds.',
    });
    return;
  }

  autoUpdater.logger = {
    info: (message: string) => appLogger.info({ source: 'electron-updater' }, message),
    warn: (message: string) => appLogger.warn({ source: 'electron-updater' }, message),
    error: (message: string) => appLogger.error({ source: 'electron-updater' }, message),
    debug: (message: string) => appLogger.debug({ source: 'electron-updater' }, message),
  } as typeof autoUpdater.logger;

  autoUpdater.on('checking-for-update', () => {
    appLogger.info('Checking for updates.');
    emitUpdateState({ status: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    appLogger.info({ version: info.version }, 'Update available.');
    emitUpdateState({
      status: 'available',
      version: info.version,
      message: 'Downloading update in the background.',
    });
  });
  autoUpdater.on('update-not-available', () => {
    appLogger.info('No updates available.');
    emitUpdateState({
      status: 'idle',
      message: 'Harness Studio is up to date.',
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    appLogger.info({ version: info.version }, 'Update downloaded.');
    emitUpdateState({
      status: 'downloaded',
      downloadedVersion: info.version,
      message: 'Update ready. Restart to install.',
    });
  });
  autoUpdater.on('error', (error) => {
    appLogger.error({ error: String(error) }, 'Auto-update check failed.');
    emitUpdateState({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  });

  void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    appLogger.error({ error: String(error) }, 'checkForUpdatesAndNotify failed.');
    emitUpdateState({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

app.whenReady().then(async () => {
  process.env['STUDIO_LOG_DIR'] = app.getPath('logs');
  logger = new StudioLoggerService(join(app.getPath('logs'), 'studio.log'), !app.isPackaged);
  logger.child({ process: 'main' }).info({ version: app.getVersion() }, 'Harness Studio starting.');
  browserWindow = createWindow();
  godotManager = new GodotManager(settingsService, (event) => sessionManager?.emitStreamEvent(event));
  sessionManager = new SessionManager(
    browserWindow,
    join(__dirname, 'agent-process.cjs'),
    database,
    godotManager,
    settingsService,
    logger,
  );
  await sessionManager.start();
  configureAutoUpdates();

  ipcMain.handle('studio:trpc', async (_event, request: TrpcRequest) => invokeTrpc(request));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      browserWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  logger?.child({ process: 'main' }).info('Harness Studio shutting down.');
  void godotManager?.stop();
  database.close();
});
