"use server";

import { protectedProcedure } from "@/server/trpc/trpc";
import { inferProcedureOutput, TRPCError } from "@trpc/server";
import { z } from "zod";

export const updateReviewerEmail = protectedProcedure
  .input(
    z.object({
      reviewerId: z.string(),
      email: z.string().trim().email().or(z.literal("")),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const reviewer = await ctx.prisma.reviewer.findUnique({
      where: { id: input.reviewerId },
      select: { project: { select: { organizationId: true } } },
    });
    if (!reviewer)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Reviewer not found.",
      });
    const membership = await ctx.prisma.member.findFirst({
      where: {
        organizationId: reviewer.project.organizationId,
        userId: ctx.session.user.id,
        role: { in: ["owner", "admin"] },
      },
      select: { id: true },
    });
    if (!membership)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only organization admins can update reviewer email mapping.",
      });
    await ctx.prisma.reviewer.update({
      where: { id: input.reviewerId },
      data: { email: input.email || null },
    });
    return { success: true };
  });

export type UpdateReviewerEmailOutput = inferProcedureOutput<
  typeof updateReviewerEmail
>;
