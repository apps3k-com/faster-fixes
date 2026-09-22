import { protectedProcedure } from "@/server/trpc/trpc";
import { TRPCError, type inferProcedureOutput } from "@trpc/server";
import { z } from "zod";

export const getPlaneExport = protectedProcedure
  .input(z.object({ feedbackId: z.string().uuid() }))
  .query(async ({ input, ctx }) => {
    const feedback = await ctx.prisma.feedback.findFirst({
      where: {
        id: input.feedbackId,
        project: {
          organization: { members: { some: { userId: ctx.session.user.id } } },
        },
      },
      select: {
        planeIssueLink: { select: { issueIdentifier: true, issueUrl: true } },
        planeExport: {
          select: {
            status: true,
            lastError: true,
            screenshotStatus: true,
            diagnosticsStatus: true,
            referenceWritten: true,
            assignmentNote: true,
          },
        },
        project: {
          select: {
            planeLink: {
              select: {
                enabled: true,
                planeInstallation: { select: { healthState: true } },
              },
            },
            organization: {
              select: {
                members: {
                  where: { userId: ctx.session.user.id },
                  select: { role: true },
                },
              },
            },
          },
        },
      },
    });
    if (!feedback)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Feedback not found.",
      });
    const active =
      process.env.PLANE_ENABLED === "true" &&
      !!feedback.project.planeLink?.enabled &&
      feedback.project.planeLink.planeInstallation.healthState === "connected";
    return {
      issue: feedback.planeIssueLink,
      operation: feedback.planeExport,
      active,
      canExport:
        active &&
        feedback.project.organization.members.some(
          ({ role }) => role === "owner" || role === "admin",
        ),
    };
  });

export type GetPlaneExportOutput = inferProcedureOutput<typeof getPlaneExport>;
