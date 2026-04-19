import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type { GodotStatus } from '../../shared/domain.js';
import type { StreamEvent } from '../../shared/protocol.js';
import type { SettingsService } from './settings-service.js';

export interface GodotLogEntry {
  id: string;
  line: string;
  stream: 'stdout' | 'stderr';
  timestamp: number;
}

function splitBufferedLines(buffer: string, chunk: string): { lines: string[]; buffer: string } {
  const combined = `${buffer}${chunk}`;
  const parts = combined.split(/\r?\n/);
  const nextBuffer = parts.pop() ?? '';

  return {
    lines: parts.filter((line) => line.length > 0),
    buffer: nextBuffer,
  };
}

export class GodotManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private status: GodotStatus = {
    status: 'stopped',
  };
  private readonly logs: GodotLogEntry[] = [];
  private stopping = false;
  private operationChain: Promise<unknown> = Promise.resolve();

  public constructor(
    private readonly settingsService: SettingsService,
    private readonly emit: (event: StreamEvent) => void,
  ) {}

  public getStatus(): GodotStatus {
    return this.status;
  }

  public getLogs(): GodotLogEntry[] {
    return [...this.logs];
  }

  public async launch(args: {
    projectPath: string;
    launchedBy: 'agent' | 'ui';
    ownerConversationId?: string;
    debuggerEnabled?: boolean;
  }): Promise<GodotStatus> {
    return await this.enqueue(async () => {
      if (this.child !== null) {
        await this.stopInternal({ requester: args.launchedBy, force: true });
      }

      const godotBinary = this.settingsService.getApiKey('godotPath') ?? process.env['GODOT_PATH'] ?? 'godot';
      this.logs.length = 0;
      this.stopping = false;

      const launchArgs = args.debuggerEnabled ? ['-d', '--path', args.projectPath] : ['--path', args.projectPath];
      const child = spawn(godotBinary, launchArgs, {
        cwd: args.projectPath,
        stdio: 'pipe',
      });

      this.child = child;
      this.status = {
        status: 'running',
        projectPath: args.projectPath,
        launchedBy: args.launchedBy,
        ...(args.ownerConversationId !== undefined ? { ownerConversationId: args.ownerConversationId } : {}),
      };
      this.emitStatus(this.status);

      let stdoutBuffer = '';
      let stderrBuffer = '';

      child.stdout.on('data', (chunk: Buffer | string) => {
        const next = splitBufferedLines(stdoutBuffer, chunk.toString());
        stdoutBuffer = next.buffer;
        for (const line of next.lines) {
          this.pushLog(line, 'stdout');
        }
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        const next = splitBufferedLines(stderrBuffer, chunk.toString());
        stderrBuffer = next.buffer;
        for (const line of next.lines) {
          this.pushLog(line, 'stderr');
        }
      });

      child.on('error', (error) => {
        this.pushLog(String(error), 'stderr');
        this.status = {
          status: 'crashed',
          projectPath: args.projectPath,
          launchedBy: args.launchedBy,
          ...(args.ownerConversationId !== undefined ? { ownerConversationId: args.ownerConversationId } : {}),
        };
        this.emitStatus(this.status);
        this.child = null;
      });

      child.on('exit', (code) => {
        if (stdoutBuffer.length > 0) {
          this.pushLog(stdoutBuffer, 'stdout');
          stdoutBuffer = '';
        }
        if (stderrBuffer.length > 0) {
          this.pushLog(stderrBuffer, 'stderr');
          stderrBuffer = '';
        }

        const nextStatus: GodotStatus = this.stopping
          ? {
              status: 'stopped',
              projectPath: args.projectPath,
              launchedBy: args.launchedBy,
              ...(args.ownerConversationId !== undefined ? { ownerConversationId: args.ownerConversationId } : {}),
              ...(code !== null ? { exitCode: code } : {}),
            }
          : {
              status: 'crashed',
              projectPath: args.projectPath,
              launchedBy: args.launchedBy,
              ...(args.ownerConversationId !== undefined ? { ownerConversationId: args.ownerConversationId } : {}),
              ...(code !== null ? { exitCode: code } : {}),
            };

        this.status = nextStatus;
        this.emitStatus(nextStatus);
        this.child = null;
        this.stopping = false;
      });

      return this.status;
    });
  }

  public async stop(args?: {
    requester: 'agent' | 'ui';
    ownerConversationId?: string;
    force?: boolean;
  }): Promise<GodotStatus> {
    return await this.enqueue(async () => await this.stopInternal(args));
  }

  private async stopInternal(args?: {
    requester: 'agent' | 'ui';
    ownerConversationId?: string;
    force?: boolean;
  }): Promise<GodotStatus> {
    if (this.child === null) {
      this.status = {
        status: 'stopped',
        ...(this.status.projectPath !== undefined ? { projectPath: this.status.projectPath } : {}),
        ...(this.status.launchedBy !== undefined ? { launchedBy: this.status.launchedBy } : {}),
        ...(this.status.ownerConversationId !== undefined
          ? { ownerConversationId: this.status.ownerConversationId }
          : {}),
      };
      return this.status;
    }

    if (!this.canRequesterStop(args)) {
      return this.status;
    }

    const child = this.child;
    this.stopping = true;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore forced kill failures during shutdown
        }
        resolve();
      }, 3_000);

      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      try {
        child.kill('SIGTERM');
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });

    return this.status;
  }

  private canRequesterStop(
    args?: {
      requester: 'agent' | 'ui';
      ownerConversationId?: string;
      force?: boolean;
    },
  ): boolean {
    if (args?.force === true) {
      return true;
    }

    if (args === undefined || this.status.launchedBy === undefined) {
      return true;
    }

    if (this.status.launchedBy !== args.requester) {
      return false;
    }

    if (this.status.launchedBy === 'agent') {
      return this.status.ownerConversationId !== undefined && this.status.ownerConversationId === args.ownerConversationId;
    }

    return true;
  }

  private emitStatus(status: GodotStatus): void {
    this.emit({
      type: 'godot-status',
      status: status.status,
      ...(status.projectPath !== undefined ? { projectPath: status.projectPath } : {}),
      ...(status.launchedBy !== undefined ? { launchedBy: status.launchedBy } : {}),
      ...(status.ownerConversationId !== undefined ? { ownerConversationId: status.ownerConversationId } : {}),
      ...(status.exitCode !== undefined ? { exitCode: status.exitCode } : {}),
    });
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.operationChain.catch(() => undefined);
    const current = pending.then(operation);
    this.operationChain = current.catch(() => undefined);
    return await current;
  }

  private pushLog(line: string, stream: 'stdout' | 'stderr'): void {
    const timestamp = Date.now();
    const entry: GodotLogEntry = {
      id: `${timestamp}-${this.logs.length}`,
      line,
      stream,
      timestamp,
    };

    this.logs.push(entry);
    if (this.logs.length > 500) {
      this.logs.shift();
    }

    this.emit({
      type: 'godot-log',
      line,
      stream,
      timestamp,
    });
  }
}
