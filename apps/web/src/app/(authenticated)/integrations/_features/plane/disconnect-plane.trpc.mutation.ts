import { TRPCError, inferProcedureOutput } from "@trpc/server";
import { auth } from "@/server/auth";
import { protectedProcedure } from "@/server/trpc/trpc";
import { headers } from "next/headers";

export const disconnectPlane = protectedProcedure.mutation(async ({ ctx }) => {
  const activeOrganization = await auth.api.getFullOrganization({
    headers: await headers(),
  });
  if (!activeOrganization)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No active organization.",
    });
  const member = await ctx.prisma.member.findFirst({
    where: {
      organizationId: activeOrganization.id,
      userId: ctx.session.user.id,
      role: { in: ["owner", "admin"] },
    },
    select: { id: true },
  });

  if (!member) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only organization owners and admins can disconnect Plane.",
    });
  }

  await ctx.prisma.planeInstallation.updateMany({
    where: { organizationId: activeOrganization.id },
    data: { healthState: "disconnected" },
  });

  return { success: true };
});

export type DisconnectPlaneOutput = inferProcedureOutput<
  typeof disconnectPlane
>;
