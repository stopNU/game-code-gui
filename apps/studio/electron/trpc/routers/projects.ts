import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { z } from 'zod';
import { router, publicProcedure } from '../trpc-base.js';
import { normalizePath } from '../../db/normalize-path.js';

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
