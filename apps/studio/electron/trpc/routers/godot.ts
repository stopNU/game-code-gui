import { router, publicProcedure } from '../router.js';

export const godotRouter = router({
  getStatus: publicProcedure.query(() => ({
    status: 'stopped' as const,
  })),
});
