import type { inferProcedureOutput } from "@trpc/server";
import { createDiscussionComment } from "@/server/plane/discussion";
import { protectedProcedure } from "@/server/trpc/trpc";
import { CreateDiscussionCommentSchema } from "./create-discussion-comment.schema";

export const createFeedbackDiscussionComment = protectedProcedure
  .input(CreateDiscussionCommentSchema)
  .mutation(({ input, ctx }) =>
    createDiscussionComment(input, ctx.session.user),
  );

export type CreateFeedbackDiscussionCommentOutput = inferProcedureOutput<
  typeof createFeedbackDiscussionComment
>;
