import { z } from "zod";

export const LinkPlaneProjectSchema = z.object({
  projectId: z.string(),
  planeProjectId: z.string(),
  exportMode: z.enum(["manual", "intake", "state"]).default("manual"),
  defaultStateId: z.string().nullable().optional(),
  workItemTypeId: z.string().nullable().optional(),
  customFieldId: z.string().nullable().optional(),
  assignmentMode: z.enum(["generic", "email"]).default("generic"),
  genericAssigneeId: z.string().min(1),
  inProgressStateIds: z.array(z.string()).default([]),
  doneStateIds: z.array(z.string()).default([]),
  commentsEnabled: z.boolean().default(false),
});

export type LinkPlaneProjectInput = z.infer<typeof LinkPlaneProjectSchema>;
