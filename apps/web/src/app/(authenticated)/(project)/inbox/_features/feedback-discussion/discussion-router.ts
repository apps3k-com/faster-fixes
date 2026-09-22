import { router } from "@/server/trpc/trpc";
import { getFeedbackDiscussionComments } from "./get-discussion-comments.trpc.query";
import { createFeedbackDiscussionComment } from "./create-discussion-comment.trpc.mutation";
import { updateFeedbackDiscussionComment } from "./update-discussion-comment.trpc.mutation";
import { deleteFeedbackDiscussionComment } from "./delete-discussion-comment.trpc.mutation";

export const feedbackDiscussionRouter = router({
  list: getFeedbackDiscussionComments,
  create: createFeedbackDiscussionComment,
  update: updateFeedbackDiscussionComment,
  delete: deleteFeedbackDiscussionComment,
});
