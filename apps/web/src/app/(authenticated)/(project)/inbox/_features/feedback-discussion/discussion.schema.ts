import { z } from "zod";

export const DiscussionSchema = z.object({ feedbackId: z.string().uuid() });
export type DiscussionInput = z.infer<typeof DiscussionSchema>;
