import { auth } from "@/server/auth";
import { prisma } from "@workspace/db";
import { TRPCError } from "@trpc/server";
import { headers } from "next/headers";

export async function requirePlaneProjectAccess(
  prismaClient: typeof prisma,
  projectId: string,
  userId: string,
  requireAdmin = false,
) {
  const project = await prismaClient.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true },
  });
  if (!project)
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
  const membership = await prismaClient.member.findFirst({
    where: {
      organizationId: project.organizationId,
      userId,
      ...(requireAdmin ? { role: { in: ["owner", "admin"] } } : {}),
    },
    select: { id: true, role: true },
  });
  if (!membership)
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
  return { organizationId: project.organizationId, membership };
}

export async function getActiveOrganizationId() {
  const organization = await auth.api.getFullOrganization({
    headers: await headers(),
  });
  if (!organization)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No active organization.",
    });
  return organization.id;
}
