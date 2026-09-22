"use server";

import { getPlaneCatalog } from "@/server/plane/service";
import { protectedProcedure } from "@/server/trpc/trpc";
import { inferProcedureOutput, TRPCError } from "@trpc/server";
import { LinkPlaneProjectSchema } from "./link-plane-project.schema";
import { requirePlaneProjectAccess } from "./_utils/plane-access";

export const linkPlaneProject = protectedProcedure
  .input(LinkPlaneProjectSchema)
  .mutation(async ({ input, ctx }) => {
    const { organizationId } = await requirePlaneProjectAccess(
      ctx.prisma,
      input.projectId,
      ctx.session.user.id,
      true,
    );
    const catalog = await getPlaneCatalog(
      organizationId,
      input.planeProjectId,
      input.workItemTypeId ?? undefined,
    );
    const remote = catalog.projects.find(
      (project) => project.id === input.planeProjectId,
    );
    if (!remote)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Plane project is not available.",
      });
    if (
      !catalog.members.some(
        (member) =>
          member.id === input.genericAssigneeId &&
          (member.role === null || member.role >= 15),
      )
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose a Plane project member as the generic assignee.",
      });
    }
    const installation = await ctx.prisma.planeInstallation.findUniqueOrThrow({
      where: { organizationId },
      select: { id: true },
    });
    const existing = await ctx.prisma.projectPlaneLink.findUnique({
      where: { projectId: input.projectId },
      select: { id: true },
    });
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This project is already linked to Plane. Update or unlink the existing link first.",
      });
    }
    return ctx.prisma.projectPlaneLink.upsert({
      where: { projectId: input.projectId },
      update: {
        planeProjectId: remote.id,
        planeProjectName: remote.name,
        planeProjectIdentifier: remote.identifier,
        planeInstallationId: installation.id,
        enabled: false,
        exportMode: input.exportMode,
        defaultStateId: input.defaultStateId ?? null,
        workItemTypeId: input.workItemTypeId ?? null,
        customFieldId: input.customFieldId ?? null,
        assignmentMode: input.assignmentMode,
        genericAssigneeId: input.genericAssigneeId,
        inProgressStateIds: input.inProgressStateIds,
        doneStateIds: input.doneStateIds,
        commentsEnabled: input.commentsEnabled,
        commentsEnabledAt: input.commentsEnabled ? new Date() : null,
      },
      create: {
        projectId: input.projectId,
        planeInstallationId: installation.id,
        planeProjectId: remote.id,
        planeProjectName: remote.name,
        planeProjectIdentifier: remote.identifier,
        enabled: false,
        exportMode: input.exportMode,
        defaultStateId: input.defaultStateId ?? null,
        workItemTypeId: input.workItemTypeId ?? null,
        customFieldId: input.customFieldId ?? null,
        assignmentMode: input.assignmentMode,
        genericAssigneeId: input.genericAssigneeId,
        inProgressStateIds: input.inProgressStateIds,
        doneStateIds: input.doneStateIds,
        commentsEnabled: input.commentsEnabled,
        commentsEnabledAt: null,
      },
      select: { id: true },
    });
  });

export type LinkPlaneProjectOutput = inferProcedureOutput<
  typeof linkPlaneProject
>;
