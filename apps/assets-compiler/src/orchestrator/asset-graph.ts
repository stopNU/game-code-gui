import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { StageName } from '../types/stage-result.js';

/**
 * On-disk asset graph. Each stage reads/writes artifacts under
 * `<bundleDir>/.compiler/<stage>/`. Keeping artifacts on disk makes runs
 * resumable and trivially debuggable.
 */
export class AssetGraph {
  constructor(public readonly bundleDir: string) {}

  stageDir(stage: StageName): string {
    return resolve(this.bundleDir, '.compiler', stage);
  }

  async ensureStageDir(stage: StageName): Promise<string> {
    const dir = this.stageDir(stage);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async writeJson<T>(stage: StageName, name: string, data: T): Promise<string> {
    const dir = await this.ensureStageDir(stage);
    const path = resolve(dir, name);
    await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
    return path;
  }

  async readJson<T>(stage: StageName, name: string): Promise<T> {
    const path = resolve(this.stageDir(stage), name);
    return JSON.parse(await readFile(path, 'utf8')) as T;
  }

  async writeBinary(stage: StageName, name: string, data: Buffer | Uint8Array): Promise<string> {
    const dir = await this.ensureStageDir(stage);
    const path = resolve(dir, name);
    await writeFile(path, data);
    return path;
  }

  async writeBundleFile(name: string, data: string | Buffer): Promise<string> {
    const path = resolve(this.bundleDir, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return path;
  }
}
