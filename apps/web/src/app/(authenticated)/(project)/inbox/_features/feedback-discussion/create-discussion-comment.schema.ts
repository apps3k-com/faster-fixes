import { z } from "zod";
import { DiscussionSchema } from "./discussion.schema";

export const CreateDiscussionCommentSchema = DiscussionSchema.extend({
  body: z.string().trim().min(1).max(10000),
});
export type CreateDiscussionCommentInput = z.infer<
  typeof CreateDiscussionCommentSchema
>;
