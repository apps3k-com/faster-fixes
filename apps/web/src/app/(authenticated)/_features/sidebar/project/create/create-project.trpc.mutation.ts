"use server";

import { generateApiKey } from "@/app/_features/project/generate-api-key";
import { generatePublicId } from "@/app/_features/project/generate-public-id";
import { getPlaneCatalog } from "@/server/plane/service";
import { enforceLimit } from "@/server/trpc/middlewares/enforce-limit";
import { planAwareProcedure } from "@/server/trpc/middlewares/with-plan-context";
import { TRPCError, inferProcedureOutput } from "@trpc/server";
import { CreateProjectSchema } from "./create-project.schema";

export const createProject = planAwareProcedure
  .use(enforceLimit("projects"))
  .input(CreateProjectSchema)
  .mutation(async ({ input, ctx }) => {
    const { prisma, session } = ctx;

    const membership = await prisma.member.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: session.user.id,
        role: { in: ["owner", "admin"] },
      },
    });

    if (!membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to create a project.",
      });
    }

    const { raw, hash, lastFour } = generateApiKey();
    let planeLink: {
      planeInstallationId: string;
      planeProjectId: string;
      planeProjectName: string;
      planeProjectIdentifier: string;
      genericAssigneeId: string;
    } | null = null;

    if (input.planeProjectId) {
      const installation = await prisma.planeInstallation.findUnique({
        where: { organizationId: input.organizationId },
        select: { id: true, botUserId: true, healthState: true },
      });
      if (!installation || installation.healthState !== "connected") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Connect Plane before linking a project.",
        });
      }
      const catalog = await getPlaneCatalog(input.organizationId);
      const remote = catalog.projects.find(
        (item) => item.id === input.planeProjectId,
      );
      if (!remote)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Plane project is not available.",
        });
      planeLink = {
        planeInstallationId: installation.id,
        planeProjectId: remote.id,
        planeProjectName: remote.name,
        planeProjectIdentifier: remote.identifier,
        genericAssigneeId: installation.botUserId || "pending",
      };
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: input.name,
          domain: input.domain,
          publicId: generatePublicId(),
          apiKeyHash: hash,
          apiKeyLastFour: lastFour,
          organizationId: input.organizationId,
          widgetConfig: {
            create: {},
          },
        },
      });
      if (planeLink) {
        await tx.projectPlaneLink.create({
          data: {
            projectId: created.id,
            ...planeLink,
            enabled: false,
          },
        });
      }
      return created;
    });

    return {
      id: project.id,
      name: project.name,
      publicId: project.publicId,
      rawApiKey: raw,
    };
  });

export type CreateProjectOutput = inferProcedureOutput<typeof createProject>;
