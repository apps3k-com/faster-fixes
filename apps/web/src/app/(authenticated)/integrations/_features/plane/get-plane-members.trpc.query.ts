"use server";

import { auth } from "@/server/auth";
import { getPlaneCatalog } from "@/server/plane/service";
import { protectedProcedure } from "@/server/trpc/trpc";
import { TRPCError, inferProcedureOutput } from "@trpc/server";
import { headers } from "next/headers";

export const getPlaneMembers = protectedProcedure.query(async ({ ctx }) => {
  const organization = await auth.api.getFullOrganization({
    headers: await headers(),
  });
  if (!organization)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No active organization.",
    });
  const membership = await ctx.prisma.member.findFirst({
    where: {
      organizationId: organization.id,
      userId: ctx.session.user.id,
      role: { in: ["owner", "admin"] },
    },
    select: { id: true },
  });
  if (!membership)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only organization owners and admins can invite Plane members.",
    });
  const catalog = await getPlaneCatalog(organization.id);
  return catalog.workspaceMembers;
});

export type GetPlaneMembersOutput = inferProcedureOutput<
  typeof getPlaneMembers
>;
