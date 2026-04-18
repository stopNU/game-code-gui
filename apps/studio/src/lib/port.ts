let portPromise: Promise<MessagePort> | null = null;

export function waitForStudioPort(): Promise<MessagePort> {
  if (portPromise !== null) {
    return portPromise;
  }

  portPromise = new Promise<MessagePort>((resolve) => {
    window.electronAPI.onPort((port) => {
      port.start();
      resolve(port);
    });
  });

  return portPromise;
}
