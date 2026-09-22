import { z } from "zod";

export const InvitePlaneMemberSchema = z.object({
  organizationId: z.string(),
  email: z.string().email(),
});

export type InvitePlaneMemberInputs = z.infer<typeof InvitePlaneMemberSchema>;
