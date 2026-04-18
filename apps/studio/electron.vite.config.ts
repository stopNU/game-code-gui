import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync } from 'fs';
import { builtinModules } from 'module';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';
import { build as esbuild } from 'esbuild';

function copyMigrationsPlugin(): Plugin {
  return {
    name: 'copy-migrations',
    closeBundle() {
      const src = resolve(__dirname, 'electron/db/migrations');
      const dest = resolve(__dirname, 'dist-electron/main/migrations');
      mkdirSync(dest, { recursive: true });
      for (const file of readdirSync(src)) {
        copyFileSync(resolve(src, file), resolve(dest, file));
      }
    },
  };
}

function buildAgentProcessPlugin(): Plugin {
  return {
    name: 'build-agent-process-esm',
    async closeBundle() {
      await esbuild({
        entryPoints: [resolve(__dirname, 'electron/agent-process.ts')],
        outfile: resolve(__dirname, 'dist-electron/main/agent-process.mjs'),
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node22',
        external: [
          'electron',
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
        ],
        banner: {
          js: `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);`,
        },
      });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyMigrationsPlugin(), buildAgentProcessPlugin()],
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
        },
        output: {
          entryFileNames: '[name].cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
          format: 'cjs',
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'electron/preload.ts'),
        },
        output: {
          entryFileNames: '[name].mjs',
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: 'index.html',
      },
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
});
