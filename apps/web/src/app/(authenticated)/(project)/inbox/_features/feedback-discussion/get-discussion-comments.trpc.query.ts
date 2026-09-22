import type { inferProcedureOutput } from "@trpc/server";
import { getDiscussionComments } from "@/server/plane/discussion";
import { protectedProcedure } from "@/server/trpc/trpc";
import { DiscussionSchema } from "./discussion.schema";

export const getFeedbackDiscussionComments = protectedProcedure
  .input(DiscussionSchema)
  .query(({ input, ctx }) =>
    getDiscussionComments(input.feedbackId, ctx.session.user.id),
  );

export type GetFeedbackDiscussionCommentsOutput = inferProcedureOutput<
  typeof getFeedbackDiscussionComments
>;
