import { z } from 'zod';
import { router, publicProcedure } from '../trpc-base.js';

export const conversationsRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          projectId: z.string().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.database.conversations.list(input?.projectId).map((conversation) => ({
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        ...(conversation.model !== null ? { model: conversation.model } : {}),
        provider: conversation.provider,
        archived: conversation.archived,
        updatedAt: new Date(conversation.updatedAt).toISOString(),
      })),
    ),
  get: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(({ ctx, input }) => {
      const conversation = ctx.database.conversations.getById(input.id);
      if (conversation === null) {
        return null;
      }

      return {
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        ...(conversation.model !== null ? { model: conversation.model } : {}),
        provider: conversation.provider,
        archived: conversation.archived,
        updatedAt: new Date(conversation.updatedAt).toISOString(),
      };
    }),
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string().nullable().optional(),
        title: z.string().min(1).max(80).default('New conversation'),
        model: z.string().min(1).optional(),
        provider: z.enum(['anthropic', 'openai', 'codex']).default('anthropic'),
      }),
    )
    .mutation(({ ctx, input }) => {
      const conversation = ctx.database.conversations.create({
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        title: input.title,
        ...(input.model !== undefined ? { model: input.model } : {}),
        provider: input.provider,
      });

      return {
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        ...(conversation.model !== null ? { model: conversation.model } : {}),
        provider: conversation.provider,
        archived: conversation.archived,
        updatedAt: new Date(conversation.updatedAt).toISOString(),
      };
    }),
  delete: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(({ ctx, input }) => {
      ctx.database.conversations.delete(input.id);
      return { deleted: true };
    }),
  setProject: publicProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string().nullable(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const conversation = ctx.database.conversations.setProject(input.id, input.projectId);
      if (conversation === null) {
        return null;
      }
      return {
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        ...(conversation.model !== null ? { model: conversation.model } : {}),
        provider: conversation.provider,
        archived: conversation.archived,
        updatedAt: new Date(conversation.updatedAt).toISOString(),
      };
    }),
  rename: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(80),
      }),
    )
    .mutation(({ ctx, input }) => {
      const conversation = ctx.database.conversations.rename(input.id, input.title);
      if (conversation === null) {
        return null;
      }

      return {
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        ...(conversation.model !== null ? { model: conversation.model } : {}),
        provider: conversation.provider,
        archived: conversation.archived,
        updatedAt: new Date(conversation.updatedAt).toISOString(),
      };
    }),
  getMessages: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.database.conversations.getMessages(input.id).map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        seq: message.seq,
        role: message.role,
        contentBlocks: message.contentBlocks,
        createdAt: new Date(message.createdAt).toISOString(),
        ...(message.langsmithRunId !== null ? { langsmithRunId: message.langsmithRunId } : {}),
      })),
    ),
});
