import { router, publicProcedure } from '../router.js';

export const langsmithRouter = router({
  getStatus: publicProcedure.query(({ ctx }) => ctx.settingsService.getLangSmithStatus()),
});
