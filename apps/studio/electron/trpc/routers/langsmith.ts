import { router, publicProcedure } from '../trpc-base.js';

export const langsmithRouter = router({
  getStatus: publicProcedure.query(({ ctx }) => ctx.settingsService.getLangSmithStatus()),
});
