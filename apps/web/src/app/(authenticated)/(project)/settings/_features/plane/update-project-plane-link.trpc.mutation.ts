"use server";

import { protectedProcedure } from "@/server/trpc/trpc";
import { inferProcedureOutput, TRPCError } from "@trpc/server";
import { getPlaneCatalog } from "@/server/plane/service";
import { z } from "zod";
import { requirePlaneProjectAccess } from "./_utils/plane-access";

const UpdateSchema = z.object({
  projectId: z.string(),
  exportMode: z.enum(["manual", "intake", "state"]).optional(),
  defaultStateId: z.string().nullable().optional(),
  workItemTypeId: z.string().nullable().optional(),
  customFieldId: z.string().nullable().optional(),
  assignmentMode: z.enum(["generic", "email"]).optional(),
  genericAssigneeId: z.string().optional(),
  inProgressStateIds: z.array(z.string()).optional(),
  doneStateIds: z.array(z.string()).optional(),
  commentsEnabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const updateProjectPlaneLink = protectedProcedure
  .input(UpdateSchema)
  .mutation(async ({ input, ctx }) => {
    const { organizationId } = await requirePlaneProjectAccess(
      ctx.prisma,
      input.projectId,
      ctx.session.user.id,
      true,
    );
    const existing = await ctx.prisma.projectPlaneLink.findUnique({
      where: { projectId: input.projectId },
    });
    if (!existing)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "This project is not linked to Plane.",
      });
    if (
      input.enabled === false &&
      Object.keys(input).every(
        (key) => key === "projectId" || key === "enabled",
      )
    ) {
      return ctx.prisma.projectPlaneLink.update({
        where: { projectId: input.projectId },
        data: { enabled: false },
        select: { id: true },
      });
    }

    const typeId =
      input.workItemTypeId === undefined
        ? existing.workItemTypeId
        : input.workItemTypeId;
    const catalog = await getPlaneCatalog(
      organizationId,
      existing.planeProjectId,
      typeId ?? undefined,
    );
    const states = new Set(catalog.states.map((state) => state.id));
    const types = new Set(catalog.types.map((type) => type.id));
    const members = new Set(
      catalog.members
        .filter((member) => member.role === null || member.role >= 15)
        .map((member) => member.id),
    );
    const genericAssigneeId =
      input.genericAssigneeId ?? existing.genericAssigneeId;
    const inProgressStateIds =
      input.inProgressStateIds ?? existing.inProgressStateIds;
    const doneStateIds = input.doneStateIds ?? existing.doneStateIds;
    const defaultStateId =
      input.defaultStateId === undefined
        ? existing.defaultStateId
        : input.defaultStateId;
    const exportMode = input.exportMode ?? existing.exportMode;
    const customFieldId =
      input.customFieldId === undefined
        ? existing.customFieldId
        : input.customFieldId;
    const enabled = input.enabled ?? existing.enabled;
    if (
      enabled &&
      (!genericAssigneeId ||
        genericAssigneeId === "pending" ||
        !members.has(genericAssigneeId))
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Choose an eligible Plane project member before enabling this link.",
      });
    }
    if (
      enabled &&
      exportMode === "state" &&
      (!defaultStateId || !states.has(defaultStateId))
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose a valid default Plane state for state export mode.",
      });
    }
    if (enabled && typeId && !types.has(typeId)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose a valid Plane work item type.",
      });
    }
    if (
      enabled &&
      exportMode === "intake" &&
      !catalog.projects.find(
        (project) => project.id === existing.planeProjectId,
      )?.intake_view
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Enable Plane Intake for this project before selecting Intake export mode.",
      });
    }
    if (
      enabled &&
      (inProgressStateIds.some((id) => !states.has(id)) ||
        doneStateIds.some((id) => !states.has(id)))
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose valid Plane states for Faster Fixes status mapping.",
      });
    }
    if (enabled && inProgressStateIds.some((id) => doneStateIds.includes(id))) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A Plane state cannot map to both In Progress and Resolved.",
      });
    }
    if (
      customFieldId &&
      !catalog.fields.some(
        (field) =>
          field.id === customFieldId &&
          field.property_type.toUpperCase() === "TEXT" &&
          field.is_active !== false &&
          field.display_format !== "readonly",
      )
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose a writable text custom field.",
      });
    }
    if (enabled && !typeId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose a Plane work item type before enabling this link.",
      });
    }
    if (enabled && !customFieldId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Choose a writable text custom field before enabling this link.",
      });
    }
    const missingRequiredDefaults = catalog.fields.filter((field) => {
      const value = field.default_value;
      return (
        field.id !== customFieldId &&
        field.is_required &&
        (value === undefined ||
          value === null ||
          value === "" ||
          (Array.isArray(value) && value.length === 0))
      );
    });
    if (enabled && missingRequiredDefaults.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Set defaults in Plane for the required fields before enabling synchronization: ${missingRequiredDefaults.map((field) => field.display_name ?? field.name).join(", ")}.`,
      });
    }
    return ctx.prisma.projectPlaneLink.update({
      where: { projectId: input.projectId },
      data: {
        ...(input.exportMode !== undefined ? { exportMode } : {}),
        ...(input.defaultStateId !== undefined ? { defaultStateId } : {}),
        ...(input.workItemTypeId !== undefined
          ? { workItemTypeId: typeId }
          : {}),
        ...(input.customFieldId !== undefined ? { customFieldId } : {}),
        ...(input.assignmentMode !== undefined
          ? { assignmentMode: input.assignmentMode }
          : {}),
        ...(input.genericAssigneeId !== undefined ? { genericAssigneeId } : {}),
        ...(input.inProgressStateIds !== undefined
          ? { inProgressStateIds }
          : {}),
        ...(input.doneStateIds !== undefined ? { doneStateIds } : {}),
        ...(input.enabled !== undefined ? { enabled } : {}),
        ...(input.commentsEnabled !== undefined
          ? { commentsEnabled: input.commentsEnabled }
          : {}),
        ...(input.commentsEnabled === true && !existing.commentsEnabled
          ? { commentsEnabledAt: new Date() }
          : {}),
      },
      select: { id: true },
    });
  });

export type UpdateProjectPlaneLinkOutput = inferProcedureOutput<
  typeof updateProjectPlaneLink
>;
