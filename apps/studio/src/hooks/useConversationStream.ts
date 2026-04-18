import { useEffect } from 'react';
import { waitForStudioPort } from '@renderer/lib/port';
import { useConversationStore } from '@renderer/store/conversation-store';
import type { StreamEvent } from '@shared/protocol';

export function useConversationStream(): void {
  const applyEvent = useConversationStore((state) => state.applyEvent);

  useEffect(() => {
    let isMounted = true;
    let currentPort: MessagePort | null = null;

    void waitForStudioPort().then((port) => {
      if (!isMounted) {
        return;
      }

      currentPort = port;
      currentPort.onmessage = (event) => {
        applyEvent(event.data as StreamEvent);
      };
    });

    return () => {
      isMounted = false;
      if (currentPort !== null) {
        currentPort.onmessage = null;
      }
    };
  }, [applyEvent]);
}
