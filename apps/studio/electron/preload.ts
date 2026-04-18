import { contextBridge, ipcRenderer } from 'electron';

type TrpcRequest = {
  path: string;
  input: unknown;
  type: 'query' | 'mutation' | 'subscription';
};

// Transfer MessagePort to the main world via window.postMessage so it
// arrives as a proper transferable (contextBridge can't pass ports directly).
ipcRenderer.on('studio:port', (event) => {
  const [port] = event.ports;
  if (port === undefined) {
    return;
  }
  window.postMessage({ type: 'studio:port' }, '*', [port]);
});

contextBridge.exposeInMainWorld('electronAPI', {
  invokeTrpc(request: TrpcRequest) {
    return ipcRenderer.invoke('studio:trpc', request);
  },
});
