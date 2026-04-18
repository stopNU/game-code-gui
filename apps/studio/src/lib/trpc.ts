import { type TRPCLink, TRPCClientError } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '@shared/trpc-types';

const ipcLink = (): TRPCLink<AppRouter> => {
  return () => {
    return ({ op }) =>
      observable((observer) => {
        window.electronAPI
          .invokeTrpc({
            path: op.path,
            input: op.input,
            type: op.type,
          })
          .then((data) => {
            observer.next({
              context: op.context,
              result: {
                type: 'data',
                data,
              },
            });
            observer.complete();
          })
          .catch((cause) => {
            observer.error(TRPCClientError.from(cause));
          });

        return () => undefined;
      });
  };
};

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [ipcLink()],
});
