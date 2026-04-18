import electronBinary from 'electron';
import { test, expect, _electron as electron } from '@playwright/test';

test.skip(process.env['RUN_STUDIO_E2E'] !== '1', 'Set RUN_STUDIO_E2E=1 to run the Electron smoke test.');

test('studio window boots and renders the shell chrome', async () => {
  const electronApp = await electron.launch({
    executablePath: electronBinary,
    args: [process.cwd()],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  try {
    const window = await electronApp.firstWindow();
    await expect(window.getByText('Harness Studio')).toBeVisible();
    await expect(window.getByText('Conversational control room for the harness')).toBeVisible();
  } finally {
    await electronApp.close();
  }
});
