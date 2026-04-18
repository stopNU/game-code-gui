import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { queryClient } from '@renderer/lib/query-client';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import './index.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('No #root element');
}

createRoot(root).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
);
