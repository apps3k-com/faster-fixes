import { inngest } from "@/server/inngest";
import { queuePlaneExport } from "@/server/plane/export";
import { protectedProcedure } from "@/server/trpc/trpc";
import { TRPCError, type inferProcedureOutput } from "@trpc/server";
import { z } from "zod";

export const createPlaneIssueForFeedback = protectedProcedure
  .input(z.object({ feedbackId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    const feedback = await ctx.prisma.feedback.findFirst({
      where: {
        id: input.feedbackId,
        project: {
          organization: {
            members: {
              some: {
                userId: ctx.session.user.id,
                role: { in: ["owner", "admin"] },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!feedback)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only organization admins can export feedback.",
      });
    const operation = await queuePlaneExport(feedback.id, true);
    if (!operation)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Connect and enable a Plane project before exporting feedback.",
      });
    // The persisted operation remains retryable even when the event service is unavailable.
    await inngest
      .send({
        name: "plane/export.requested",
        data: { feedbackId: feedback.id },
      })
      .catch(() => undefined);
    return { queued: true };
  });

export type CreatePlaneIssueForFeedbackOutput = inferProcedureOutput<
  typeof createPlaneIssueForFeedback
>;
