"use server";

import { auth } from "@/server/auth";
import { enforceLimit } from "@/server/trpc/middlewares/enforce-limit";
import { planAwareProcedure } from "@/server/trpc/middlewares/with-plan-context";
import { inferProcedureOutput, TRPCError } from "@trpc/server";
import { InvitePlaneMemberSchema } from "./invite-plane-member.schema";

export const invitePlaneMember = planAwareProcedure
  .use(enforceLimit("seats"))
  .input(InvitePlaneMemberSchema)
  .mutation(async ({ input, ctx }) => {
    const membership = await ctx.prisma.member.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: ctx.session.user.id,
        role: { in: ["owner", "admin"] },
      },
      select: { id: true },
    });
    if (!membership)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only organization owners and admins can invite members.",
      });
    try {
      return await auth.api.createInvitation({
        body: {
          email: input.email,
          role: "member",
          organizationId: input.organizationId,
        },
        headers: ctx.headers,
      });
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          error instanceof Error ? error.message : "Error sending invitation.",
      });
    }
  });

export type InvitePlaneMemberOutput = inferProcedureOutput<
  typeof invitePlaneMember
>;
