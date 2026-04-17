import type { Page } from 'playwright';
import type { HarnessState } from '../types/harness.js';

export class HarnessReader {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async waitForHarness(timeoutMs = 10000): Promise<void> {
    await this.page.waitForFunction(
      () => typeof window.__HARNESS__ !== 'undefined' && typeof window.__HARNESS__.getState === 'function',
      { timeout: timeoutMs },
    );
  }

  async getState(): Promise<HarnessState> {
    return this.page.evaluate(() => {
      if (!window.__HARNESS__) throw new Error('window.__HARNESS__ not defined');
      return window.__HARNESS__.getState();
    });
  }

  async waitForScene(sceneKey: string, timeoutMs = 10000): Promise<HarnessState> {
    await this.page.waitForFunction(
      (key) => {
        if (!window.__HARNESS__) return false;
        const state = window.__HARNESS__.getState();
        return state.scene === key;
      },
      sceneKey,
      { timeout: timeoutMs },
    );
    return this.getState();
  }

  async waitForSceneInHistory(sceneKey: string, timeoutMs = 10000): Promise<HarnessState> {
    await this.page.waitForFunction(
      (key) => {
        if (!window.__HARNESS__) return false;
        const state = window.__HARNESS__.getState();
        return state.sceneHistory.includes(key);
      },
      sceneKey,
      { timeout: timeoutMs },
    );
    return this.getState();
  }

  async emitToGame(event: string, data?: unknown): Promise<void> {
    await this.page.evaluate(
      ([e, d]) => {
        if (!window.__HARNESS__) throw new Error('window.__HARNESS__ not defined');
        window.__HARNESS__.emit(e as string, d);
      },
      [event, data],
    );
  }

  async getGameState(): Promise<Record<string, unknown>> {
    const state = await this.getState();
    return state.gameState;
  }

  async getErrors(): Promise<string[]> {
    const state = await this.getState();
    return state.errorLog;
  }
}
