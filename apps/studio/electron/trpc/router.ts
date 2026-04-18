import { agentRouter } from './routers/agent.js';
import { approvalsRouter } from './routers/approvals.js';
import { conversationsRouter } from './routers/conversations.js';
import { godotRouter } from './routers/godot.js';
import { langsmithRouter } from './routers/langsmith.js';
import { projectsRouter } from './routers/projects.js';
import { runtimeRouter } from './routers/runtime.js';
import { settingsRouter } from './routers/settings.js';
import { router } from './trpc-base.js';

export { router, publicProcedure } from './trpc-base.js';

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
