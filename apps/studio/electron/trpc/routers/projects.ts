import { z } from 'zod';
import { router, publicProcedure } from '../trpc-base.js';

export const projectsRouter = router({
  list: publicProcedure.input(z.void()).query(({ ctx }) => ctx.projectScanner.list(ctx.settingsService.getEffectiveWorkspaceRoot())),
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
