import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async launch(headless = true): Promise<void> {
    this.browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
  }

  async newPage(): Promise<Page> {
    if (!this.context) throw new Error('Browser not launched. Call launch() first.');
    return this.context.newPage();
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }

  get isRunning(): boolean {
    return this.browser !== null;
  }
}
