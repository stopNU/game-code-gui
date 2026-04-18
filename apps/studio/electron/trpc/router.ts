import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';
import { agentRouter } from './routers/agent.js';
import { approvalsRouter } from './routers/approvals.js';
import { conversationsRouter } from './routers/conversations.js';
import { godotRouter } from './routers/godot.js';
import { langsmithRouter } from './routers/langsmith.js';
import { projectsRouter } from './routers/projects.js';
import { runtimeRouter } from './routers/runtime.js';
import { settingsRouter } from './routers/settings.js';
import type { TrpcContext } from './context.js';

const t = initTRPC.context<TrpcContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = router({
  projects: projectsRouter,
  conversations: conversationsRouter,
  agent: agentRouter,
  approvals: approvalsRouter,
  godot: godotRouter,
  settings: settingsRouter,
  langsmith: langsmithRouter,
  runtime: runtimeRouter,
});

export type AppRouter = typeof appRouter;
