import { z } from 'zod';
import { router, publicProcedure } from '../router.js';

export const agentRouter = router({
  send: publicProcedure
    .input(
      z.object({
        conversationId: z.string(),
        userMessage: z.string().min(1),
        projectId: z.string().optional(),
        model: z.string().min(1).default('claude-sonnet-4-6'),
        provider: z.enum(['anthropic', 'openai']).default('anthropic'),
      }),
    )
    .mutation(({ ctx, input }) => {
      ctx.sessionManager.sendCommand({
        type: 'send',
        conversationId: input.conversationId,
        userMessage: input.userMessage,
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        model: input.model,
        provider: input.provider,
      });
      return { accepted: true };
    }),
  abort: publicProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .mutation(({ ctx, input }) => {
      ctx.sessionManager.sendCommand({
        type: 'abort',
        conversationId: input.conversationId,
      });
      return { accepted: true };
    }),
});
