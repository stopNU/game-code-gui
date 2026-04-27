import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@agent-harness/assets-compiler',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
