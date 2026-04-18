/// <reference types="vite/client" />

declare global {
  interface Window {
    electronAPI: {
      onPort: (listener: (port: MessagePort) => void) => () => void;
      invokeTrpc: (request: {
        path: string;
        input: unknown;
        type: 'query' | 'mutation' | 'subscription';
      }) => Promise<unknown>;
    };
  }
}

export {};
