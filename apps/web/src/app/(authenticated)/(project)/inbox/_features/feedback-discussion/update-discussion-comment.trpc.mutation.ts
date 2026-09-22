import type { inferProcedureOutput } from "@trpc/server";
import { updateDiscussionComment } from "@/server/plane/discussion";
import { protectedProcedure } from "@/server/trpc/trpc";
import { UpdateDiscussionCommentSchema } from "./update-discussion-comment.schema";

export const updateFeedbackDiscussionComment = protectedProcedure
  .input(UpdateDiscussionCommentSchema)
  .mutation(({ input, ctx }) =>
    updateDiscussionComment(input, ctx.session.user.id),
  );

export type UpdateFeedbackDiscussionCommentOutput = inferProcedureOutput<
  typeof updateFeedbackDiscussionComment
>;
