import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { router, publicProcedure } from '../trpc-base.js';
import { normalizePath } from '../../db/normalize-path.js';
import { applyLangSmithEnv } from '../../agent/langsmith/env.js';
// Dynamic import used intentionally: the electron main process is built as CJS,
// but @agent-harness/services is pure ESM. A static require() would fail at
// runtime; import() loads ESM correctly from CJS context.
async function getPlanGameService(): Promise<typeof import('@agent-harness/services').planGameService> {
  const mod = await import('@agent-harness/services');
  return mod.planGameService;
}

export const projectsRouter = router({
  list: publicProcedure.input(z.void()).query(({ ctx }) => ctx.projectScanner.list(ctx.settingsService.getEffectiveWorkspaceRoot())),
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      path: z.string().min(1),
    }))
    .mutation(({ ctx, input }) => {
      const expandedPath = input.path.replace(/^~/, homedir());
      mkdirSync(expandedPath, { recursive: true });
      const project = ctx.database.projects.upsert({
        normalizedPath: normalizePath(expandedPath),
        displayPath: expandedPath,
        title: input.name,
      });
      return { id: project.id, path: expandedPath };
    }),
  scaffold: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      path: z.string().min(1),
      brief: z.string().min(1),
    }))
    .mutation(({ ctx, input }) => {
      const jobId = randomUUID();
      const expandedPath = input.path.replace(/^~/, homedir());

      // Ensure ANTHROPIC_API_KEY is available for planGameService (which reads process.env directly).
      const apiKey = ctx.settingsService.getApiKey('anthropic');
      if (apiKey !== null && (process.env['ANTHROPIC_API_KEY'] === undefined || process.env['ANTHROPIC_API_KEY'] === '')) {
        process.env['ANTHROPIC_API_KEY'] = apiKey;
      }

      const emit = (line: string, done = false): void => {
        ctx.sessionManager.emitStreamEvent({ type: 'scaffold-log', jobId, line, done });
      };

      // Apply LangSmith tracing for the planning phase (mirrors conversation-agent.ts pattern).
      const langSmithCfg = ctx.settingsService.getLangSmithRuntimeConfig();
      const planningCfg = { ...langSmithCfg, projectName: `${langSmithCfg.projectName}-planning` };
      applyLangSmithEnv(planningCfg);

      // Fire-and-forget: run the full scaffold pipeline async
      void (async () => {
        try {
          mkdirSync(expandedPath, { recursive: true });
          emit('Project directory created.');
          emit(`[LangSmith] tracing ${planningCfg.enabled && langSmithCfg.apiKey !== null ? 'enabled' : 'disabled'} (project: ${planningCfg.projectName})`);

          const planGameService = await getPlanGameService();
          const plan = await planGameService({
            brief: input.brief,
            outputPath: expandedPath,
            onStageChange: (stage) => {
              if (stage === 'preprocessing') {
                emit('Preprocessing brief with AI…');
              } else if (stage === 'planning') {
                emit('Generating game plan with AI…');
              } else if (stage === 'scaffolding') {
                emit('Scaffolding Godot project structure…');
              } else if (stage === 'installing-deps') {
                emit('Installing project dependencies…');
              }
            },
          });

          emit('Project ready.', true);

          const project = ctx.database.projects.upsert({
            normalizedPath: normalizePath(expandedPath),
            displayPath: expandedPath,
            title: plan.gameTitle ?? input.name,
          });

          ctx.sessionManager.emitStreamEvent({
            type: 'scaffold-done',
            jobId,
            projectId: project.id,
            path: expandedPath,
            gameTitle: plan.gameTitle ?? input.name,
          });
        } catch (error) {
          ctx.sessionManager.emitStreamEvent({
            type: 'scaffold-error',
            jobId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })();

      return { jobId };
    }),
  getInfo: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(({ ctx, input }) => ctx.projectScanner.getInfo(input.id)),
  getPlan: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(({ ctx, input }) => ctx.projectScanner.getPlan(input.id)),
});
