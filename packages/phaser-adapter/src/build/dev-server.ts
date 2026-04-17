import { execa } from 'execa';
import type { DevServerHandle } from '../types/project.js';

export async function startDevServer(
  projectPath: string,
  port = 5173,
): Promise<DevServerHandle> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let proc: any;

  const ready = new Promise<void>((resolve, reject) => {
    proc = execa('pnpm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
      cwd: projectPath,
      reject: false,
    });

    const timeout = setTimeout(() => {
      reject(new Error('Dev server did not start within 30 seconds'));
    }, 30000);

    const onData = (chunk: Buffer): void => {
      const text = chunk.toString();
      if (text.includes('Local:') || text.includes('localhost')) {
        clearTimeout(timeout);
        resolve();
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    proc.stdout?.on('data', onData);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    proc.stderr?.on('data', onData);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    proc.on('error', reject);
  });

  await ready;

  return {
    url: `http://localhost:${port}`,
    port,
    stop: async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      proc?.kill('SIGTERM');
      await new Promise<void>((res) => {
        if (!proc) { res(); return; }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        proc.on('exit', () => res());
        setTimeout(res, 3000);
      });
    },
  };
}
