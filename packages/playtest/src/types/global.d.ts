import type { HarnessState, HarnessButton } from './harness.js';

interface GameHarness {
  version: string;
  buttons: HarnessButton[];
  getState: () => HarnessState;
  emit: (event: string, data?: unknown) => void;
}

declare global {
  interface Window {
    __HARNESS__: GameHarness;
  }
}

export {};
