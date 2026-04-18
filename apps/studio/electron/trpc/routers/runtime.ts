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
  restartToInstallUpdate: publicProcedure.mutation(({ ctx }) => {
    const ready = ctx.installDownloadedUpdate();
    return { queued: ready };
  }),
});
