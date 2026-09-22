import z from "zod";

export const CreateReviewerSchema = z.object({
  projectId: z.string(),
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("")),
});

export type CreateReviewerInputs = z.infer<typeof CreateReviewerSchema>;
