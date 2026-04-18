import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from 'fs';
import { dirname } from 'path';
import { Writable } from 'stream';
import pino, { type Logger } from 'pino';

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const MAX_LOG_FILES = 5;

class RotatingFileStream extends Writable {
  private readonly logFilePath: string;
  private fd: number;
  private size: number;

  public constructor(logFilePath: string) {
    super();
    this.logFilePath = logFilePath;
    mkdirSync(dirname(logFilePath), { recursive: true });
    this.fd = openSync(this.logFilePath, 'a');
    this.size = existsSync(this.logFilePath) ? statSync(this.logFilePath).size : 0;
  }

  public getFilePath(): string {
    return this.logFilePath;
  }

  public writeRawLine(line: string): void {
    const normalized = line.endsWith('\n') ? line : `${line}\n`;
    const chunk = Buffer.from(normalized, 'utf8');
    this.writeChunk(chunk);
  }

  public override _write(
    chunk: string | Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      const payload = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
      this.writeChunk(payload);
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  public override _final(callback: (error?: Error | null) => void): void {
    try {
      closeSync(this.fd);
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  private writeChunk(chunk: Buffer): void {
    if (this.size + chunk.length > MAX_LOG_BYTES) {
      this.rotate();
    }

    writeSync(this.fd, chunk);
    this.size += chunk.length;
  }

  private rotate(): void {
    closeSync(this.fd);

    const oldest = `${this.logFilePath}.${MAX_LOG_FILES}`;
    if (existsSync(oldest)) {
      unlinkSync(oldest);
    }

    for (let index = MAX_LOG_FILES - 1; index >= 1; index -= 1) {
      const source = `${this.logFilePath}.${index}`;
      const target = `${this.logFilePath}.${index + 1}`;
      if (existsSync(source)) {
        renameSync(source, target);
      }
    }

    if (existsSync(this.logFilePath)) {
      renameSync(this.logFilePath, `${this.logFilePath}.1`);
    }

    this.fd = openSync(this.logFilePath, 'a');
    this.size = 0;
  }
}

export class StudioLoggerService {
  private readonly stream: RotatingFileStream;
  private readonly rootLogger: Logger;

  public constructor(logFilePath: string, mirrorToStdout: boolean) {
    this.stream = new RotatingFileStream(logFilePath);
    this.rootLogger = pino(
      {
        level: mirrorToStdout ? 'debug' : 'info',
        base: null,
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      mirrorToStdout ? pino.multistream([{ stream: this.stream }, { stream: process.stdout }]) : this.stream,
    );
  }

  public child(bindings: Record<string, unknown>): Logger {
    return this.rootLogger.child(bindings);
  }

  public getLogFilePath(): string {
    return this.stream.getFilePath();
  }

  public writeRawLine(line: string): void {
    this.stream.writeRawLine(line);
    if (this.rootLogger.levelVal <= 20) {
      process.stdout.write(line.endsWith('\n') ? line : `${line}\n`);
    }
  }

  public readTail(maxBytes = 8_192): string {
    const filePath = this.getLogFilePath();
    if (!existsSync(filePath)) {
      return '';
    }

    const contents = readFileSync(filePath, 'utf8');
    return contents.slice(-maxBytes);
  }
}
