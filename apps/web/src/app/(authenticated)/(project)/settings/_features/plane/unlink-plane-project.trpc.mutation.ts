"use server";

import { protectedProcedure } from "@/server/trpc/trpc";
import { inferProcedureOutput, TRPCError } from "@trpc/server";
import { z } from "zod";
import { requirePlaneProjectAccess } from "./_utils/plane-access";

export const unlinkPlaneProject = protectedProcedure
  .input(z.object({ projectId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    await requirePlaneProjectAccess(
      ctx.prisma,
      input.projectId,
      ctx.session.user.id,
      true,
    );
    const link = await ctx.prisma.projectPlaneLink.findUnique({
      where: { projectId: input.projectId },
      select: {
        id: true,
        _count: { select: { feedbackIssueLinks: true, exports: true } },
      },
    });
    if (!link) return { success: true };
    if (link._count.feedbackIssueLinks > 0 || link._count.exports > 0)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This link has Plane history. Disable it instead of unlinking it.",
      });
    await ctx.prisma.projectPlaneLink.delete({ where: { id: link.id } });
    return { success: true };
  });

export type UnlinkPlaneProjectOutput = inferProcedureOutput<
  typeof unlinkPlaneProject
>;
