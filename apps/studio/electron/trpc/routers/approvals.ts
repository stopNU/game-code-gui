import { z } from 'zod';
import { router, publicProcedure } from '../trpc-base.js';

export const approvalsRouter = router({
  listPending: publicProcedure
    .input(
      z
        .object({
          conversationId: z.string().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.database.approvals.listPending(input?.conversationId).map((approval) => ({
        id: approval.id,
        conversationId: approval.conversationId,
        toolName: approval.toolName,
        reason: approval.rationale ?? undefined,
        args: approval.args,
        riskLevel: approval.riskLevel,
        scope: approval.scope,
        status: approval.status,
      })),
    ),
  decide: publicProcedure
    .input(
      z.object({
        id: z.string(),
        decision: z.enum(['approved', 'denied', 'timeout', 'aborted']),
        scope: z.enum(['once', 'conversation', 'project']).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const approval = ctx.database.approvals.decide({
        id: input.id,
        status: input.decision,
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        decidedBy: 'user',
      });
      ctx.sessionManager.handleApprovalDecision(input.id, input.decision, input.scope);
      return approval;
    }),
});
