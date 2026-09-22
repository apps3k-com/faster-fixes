"use server";

import { protectedProcedure } from "@/server/trpc/trpc";
import { inferProcedureOutput } from "@trpc/server";
import { z } from "zod";
import { requirePlaneProjectAccess } from "./_utils/plane-access";

export const getProjectPlaneLink = protectedProcedure
  .input(z.object({ projectId: z.string() }))
  .query(async ({ input, ctx }) => {
    await requirePlaneProjectAccess(
      ctx.prisma,
      input.projectId,
      ctx.session.user.id,
    );
    const link = await ctx.prisma.projectPlaneLink.findUnique({
      where: { projectId: input.projectId },
      select: {
        id: true,
        planeProjectId: true,
        planeProjectName: true,
        planeProjectIdentifier: true,
        enabled: true,
        exportMode: true,
        defaultStateId: true,
        workItemTypeId: true,
        customFieldId: true,
        assignmentMode: true,
        genericAssigneeId: true,
        inProgressStateIds: true,
        doneStateIds: true,
        commentsEnabled: true,
        linkHealthIssue: true,
        planeInstallation: { select: { workspaceSlug: true } },
      },
    });

    if (!link) return null;
    const { planeInstallation, ...linkData } = link;
    return { ...linkData, workspaceSlug: planeInstallation.workspaceSlug };
  });

export type GetProjectPlaneLinkOutput = inferProcedureOutput<
  typeof getProjectPlaneLink
>;
