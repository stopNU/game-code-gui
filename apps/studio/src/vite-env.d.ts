/// <reference types="vite/client" />

declare global {
  interface Window {
    electronAPI: {
      invokeTrpc: (request: {
        path: string;
        input: unknown;
        type: 'query' | 'mutation' | 'subscription';
      }) => Promise<unknown>;
    };
  }
}

export {};
