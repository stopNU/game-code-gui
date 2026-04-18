import { join } from 'path';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { openStudioDatabase } from './db/index.js';
import { ProjectScanner } from './services/project-scanner.js';
import { ElectronSafeStorageSecretStorage } from './services/secret-storage.js';
import { SettingsService } from './services/settings-service.js';
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

  return {
    sessionManager,
    workspaceRoot,
    database,
    projectScanner,
    settingsService,
  };
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

app.whenReady().then(async () => {
  browserWindow = createWindow();
  sessionManager = new SessionManager(browserWindow, join(__dirname, 'agent-process.cjs'), database, settingsService);
  await sessionManager.start();

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
  database.close();
});
