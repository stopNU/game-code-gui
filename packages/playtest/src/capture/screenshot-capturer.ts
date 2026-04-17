import type { Page } from 'playwright';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export class ScreenshotCapturer {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async capture(outputPath: string, fullPage = false): Promise<string> {
    await mkdir(dirname(outputPath), { recursive: true });
    await this.page.screenshot({ path: outputPath, fullPage });
    return outputPath;
  }

  async captureCanvas(outputPath: string): Promise<string> {
    await mkdir(dirname(outputPath), { recursive: true });
    const canvas = this.page.locator('canvas').first();
    await canvas.screenshot({ path: outputPath });
    return outputPath;
  }
}
