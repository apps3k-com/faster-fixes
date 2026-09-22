"use server";

import { getPlaneCatalog } from "@/server/plane/service";
import { protectedProcedure } from "@/server/trpc/trpc";
import { inferProcedureOutput } from "@trpc/server";
import { z } from "zod";
import {
  requirePlaneProjectAccess,
  getActiveOrganizationId,
} from "./_utils/plane-access";

export const listPlaneCatalog = protectedProcedure
  .input(
    z.object({
      projectId: z.string(),
      planeProjectId: z.string().optional(),
      typeId: z.string().optional(),
    }),
  )
  .query(async ({ input, ctx }) => {
    const { organizationId } = await requirePlaneProjectAccess(
      ctx.prisma,
      input.projectId,
      ctx.session.user.id,
      true,
    );
    return getPlaneCatalog(organizationId, input.planeProjectId, input.typeId);
  });

export type ListPlaneCatalogOutput = inferProcedureOutput<
  typeof listPlaneCatalog
>;

export const listPlaneProjects = protectedProcedure.query(async ({ ctx }) => {
  const organizationId = await getActiveOrganizationId();
  const membership = await ctx.prisma.member.findFirst({
    where: {
      organizationId,
      userId: ctx.session.user.id,
      role: { in: ["owner", "admin"] },
    },
    select: { id: true },
  });
  if (!membership) throw new Error("Access denied.");
  const installation = await ctx.prisma.planeInstallation.findUnique({
    where: { organizationId },
    select: { healthState: true },
  });
  if (!installation || installation.healthState !== "connected") return [];
  const catalog = await getPlaneCatalog(organizationId);
  return catalog.projects;
});
