import { z } from 'zod';
import { router, publicProcedure } from '../router.js';

export const runtimeRouter = router({
  getStatus: publicProcedure.query(({ ctx }) => ({
    appVersion: ctx.appVersion,
    isPackaged: ctx.isPackaged,
    logFilePath: ctx.logFilePath,
    updateState: ctx.getUpdateState(),
  })),
  openLogFile: publicProcedure.mutation(async ({ ctx }) => {
    await ctx.openLogFile();
    return { opened: true };
  }),
  openPath: publicProcedure
    .input(
      z.object({
        path: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.openPath(input.path);
      return { opened: true };
    }),
  chooseDirectory: publicProcedure
    .input(
      z
        .object({
          defaultPath: z.string().min(1).optional(),
        })
        .optional(),
    )
    .mutation(({ ctx, input }) => ctx.chooseDirectory(input?.defaultPath)),
  chooseFile: publicProcedure
    .input(
      z.object({
        defaultPath: z.string().min(1).optional(),
        filters: z
          .array(
            z.object({
              name: z.string().min(1),
              extensions: z.array(z.string().min(1)),
            }),
          )
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.chooseFile({
        ...(input.defaultPath !== undefined ? { defaultPath: input.defaultPath } : {}),
        ...(input.filters !== undefined ? { filters: input.filters } : {}),
      }),
    ),
  getDoctorOutput: publicProcedure.query(({ ctx }) => ctx.getDoctorOutput()),
  restartToInstallUpdate: publicProcedure.mutation(({ ctx }) => {
    const ready = ctx.installDownloadedUpdate();
    return { queued: ready };
  }),
});
