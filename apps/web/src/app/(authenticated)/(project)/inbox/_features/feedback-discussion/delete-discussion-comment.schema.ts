import { z } from "zod";
import { DiscussionSchema } from "./discussion.schema";

export const DeleteDiscussionCommentSchema = DiscussionSchema.extend({
  commentId: z.string().uuid(),
});
export type DeleteDiscussionCommentInput = z.infer<
  typeof DeleteDiscussionCommentSchema
>;
