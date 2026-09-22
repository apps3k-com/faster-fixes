import { inferProcedureOutput } from "@trpc/server";
import { auth } from "@/server/auth";
import { protectedProcedure } from "@/server/trpc/trpc";
import { headers } from "next/headers";
import { TRPCError } from "@trpc/server";
import { isPlaneEnabled } from "@/server/plane/client";

export const getPlaneInstallation = protectedProcedure.query(
  async ({ ctx }) => {
    const activeOrganization = await auth.api.getFullOrganization({
      headers: await headers(),
    });
    if (!activeOrganization) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No active organization.",
      });
    }
    const membership = await ctx.prisma.member.findFirst({
      where: {
        organizationId: activeOrganization.id,
        userId: ctx.session.user.id,
      },
      select: { id: true },
    });
    if (!membership)
      throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
    const installation = await ctx.prisma.planeInstallation.findUnique({
      where: { organizationId: activeOrganization.id },
      select: {
        id: true,
        workspaceName: true,
        workspaceSlug: true,
        healthState: true,
        createdAt: true,
        installedBy: { select: { user: { select: { name: true } } } },
      },
    });

    if (!installation) return { enabled: isPlaneEnabled(), installation: null };

    return {
      enabled: isPlaneEnabled(),
      installation: {
        ...installation,
        installedByName: installation.installedBy?.user.name ?? null,
      },
    };
  },
);

export type GetPlaneInstallationOutput = inferProcedureOutput<
  typeof getPlaneInstallation
>;
