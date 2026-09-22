import type { inferProcedureOutput } from "@trpc/server";
import { deleteDiscussionComment } from "@/server/plane/discussion";
import { protectedProcedure } from "@/server/trpc/trpc";
import { DeleteDiscussionCommentSchema } from "./delete-discussion-comment.schema";

export const deleteFeedbackDiscussionComment = protectedProcedure
  .input(DeleteDiscussionCommentSchema)
  .mutation(({ input, ctx }) =>
    deleteDiscussionComment(input, ctx.session.user.id),
  );

export type DeleteFeedbackDiscussionCommentOutput = inferProcedureOutput<
  typeof deleteFeedbackDiscussionComment
>;
