import { contextBridge, ipcRenderer } from 'electron';

type TrpcRequest = {
  path: string;
  input: unknown;
  type: 'query' | 'mutation' | 'subscription';
};

const portListeners = new Set<(port: MessagePort) => void>();

ipcRenderer.on('studio:port', (event) => {
  const [port] = event.ports;
  if (port === undefined) {
    return;
  }

  for (const listener of portListeners) {
    listener(port);
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  onPort(listener: (port: MessagePort) => void) {
    portListeners.add(listener);
    return () => {
      portListeners.delete(listener);
    };
  },
  invokeTrpc(request: TrpcRequest) {
    return ipcRenderer.invoke('studio:trpc', request);
  },
});
