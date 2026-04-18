import { z } from 'zod';
import { router, publicProcedure } from '../router.js';

export const godotRouter = router({
  getStatus: publicProcedure.query(({ ctx }) => ctx.godotManager.getStatus()),
  getLogs: publicProcedure.query(({ ctx }) => ctx.godotManager.getLogs()),
  launch: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = ctx.projectScanner.getInfo(input.projectId);
      if (project === null) {
        throw new Error(`Project ${input.projectId} was not found.`);
      }
      if (project.status !== 'ready') {
        throw new Error(`Project ${project.title ?? project.name} is not ready to launch.`);
      }

      return await ctx.godotManager.launch({
        projectPath: project.path,
        launchedBy: 'ui',
      });
    }),
  stop: publicProcedure.mutation(async ({ ctx }) => await ctx.godotManager.stop({ requester: 'ui', force: true })),
});
