import { z } from "zod";
import { CreateDiscussionCommentSchema } from "./create-discussion-comment.schema";

export const UpdateDiscussionCommentSchema =
  CreateDiscussionCommentSchema.extend({
    commentId: z.string().uuid(),
  });
export type UpdateDiscussionCommentInput = z.infer<
  typeof UpdateDiscussionCommentSchema
>;
