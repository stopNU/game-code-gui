let portPromise: Promise<MessagePort> | null = null;

export function waitForStudioPort(): Promise<MessagePort> {
  if (portPromise !== null) {
    return portPromise;
  }

  portPromise = new Promise<MessagePort>((resolve) => {
    function handler(event: MessageEvent): void {
      if ((event.data as { type?: string } | null)?.type !== 'studio:port') {
        return;
      }
      const port = event.ports[0];
      if (port === undefined) {
        return;
      }
      window.removeEventListener('message', handler);
      port.start();
      resolve(port);
    }
    window.addEventListener('message', handler);
  });

  return portPromise;
}
