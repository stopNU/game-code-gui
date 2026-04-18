import { z } from 'zod';
import { router, publicProcedure } from '../router.js';

export const settingsRouter = router({
  getStatus: publicProcedure.query(({ ctx }) => ctx.settingsService.getStatus()),
  get: publicProcedure
    .input(
      z.object({
        key: z.string().min(1),
      }),
    )
    .query(({ ctx, input }) => ctx.settingsService.get(input.key)),
  set: publicProcedure
    .input(
      z.object({
        key: z.string().min(1),
        value: z.string(),
      }),
    )
    .mutation(({ ctx, input }) => ctx.settingsService.set(input.key, input.value)),
  getApiKey: publicProcedure
    .input(
      z.object({
        name: z.enum(['anthropic', 'openai', 'fal', 'langsmith', 'godotPath', 'claudePath']),
      }),
    )
    .query(({ ctx, input }) => ctx.settingsService.getApiKey(input.name)),
  setApiKey: publicProcedure
    .input(
      z.object({
        name: z.enum(['anthropic', 'openai', 'fal', 'langsmith', 'godotPath', 'claudePath']),
        value: z.string(),
      }),
    )
    .mutation(({ ctx, input }) => {
      ctx.settingsService.setApiKey(input.name, input.value);
      return { saved: true };
    }),
  getWorkspaceRoot: publicProcedure.query(({ ctx }) => ctx.settingsService.getWorkspaceRoot()),
  setWorkspaceRoot: publicProcedure
    .input(
      z.object({
        path: z.string().min(1),
      }),
    )
    .mutation(({ ctx, input }) => ctx.settingsService.setWorkspaceRoot(input.path)),
});
