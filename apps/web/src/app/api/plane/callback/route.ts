import { auth } from "@/server/auth";
import {
  clearOAuthStateCookie,
  isValidOAuthState,
} from "@/server/oauth/state-cookie";
import {
  encryptPlaneToken,
  isPlaneEnabled,
  PlaneClient,
  requestBotToken,
} from "@/server/plane/client";
import { prisma } from "@workspace/db";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const base = process.env.BETTER_AUTH_URL ?? process.env.BASE_URL!;
  const finish = (result: string) => {
    const response = NextResponse.redirect(`${base}/integrations?${result}`);
    clearOAuthStateCookie(response, {
      name: "plane_oauth_state",
      maxAgeSeconds: 600,
    });
    return response;
  };
  if (!isPlaneEnabled()) return finish("error=plane_disabled");
  const state = req.nextUrl.searchParams.get("state");
  const installationId = req.nextUrl.searchParams.get("app_installation_id");
  if (
    !installationId ||
    !state ||
    !isValidOAuthState(
      req,
      { name: "plane_oauth_state", maxAgeSeconds: 600 },
      state,
    )
  )
    return finish("error=plane_invalid_state");
  const session = await auth.api.getSession({ headers: req.headers });
  const pending = await prisma.planeOAuthState.findUnique({
    where: { id: state },
  });
  if (
    !session ||
    !pending ||
    pending.userId !== session.user.id ||
    pending.expiresAt < new Date()
  )
    return finish("error=plane_invalid_state");
  const member = await prisma.member.findFirst({
    where: {
      organizationId: pending.organizationId,
      userId: session.user.id,
      role: { in: ["owner", "admin"] },
    },
  });
  if (!member) return finish("error=plane_insufficient_role");
  // Expiring the nonce atomically also excludes concurrent callback replay.
  const consumed = await prisma.planeOAuthState.updateMany({
    where: { id: state, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date(0) },
  });
  if (!consumed.count) return finish("error=plane_invalid_state");
  try {
    const token = await requestBotToken(installationId);
    const client = new PlaneClient(token.access_token, "");
    const installations = await client.request<
      {
        id: string;
        workspace: string;
        workspace_detail: { name: string; slug: string };
        app_bot: string;
        status: string;
      }[]
    >(`/auth/o/app-installation/?id=${encodeURIComponent(installationId)}`);
    const remote = installations.find(
      (item) => item.id === installationId && item.status === "installed",
    );
    if (!remote?.workspace || !remote.app_bot || !remote.workspace_detail?.slug)
      return finish("error=plane_installation_unavailable");
    const existing = await prisma.planeInstallation.findUnique({
      where: { organizationId: pending.organizationId },
      include: { projectLinks: { select: { id: true } } },
    });
    if (
      existing &&
      existing.workspaceId !== remote.workspace &&
      existing.projectLinks.length
    )
      return finish("error=plane_workspace_change_blocked");
    const data = {
      appInstallationId: installationId,
      workspaceId: remote.workspace,
      workspaceSlug: remote.workspace_detail.slug,
      workspaceName: remote.workspace_detail.name,
      botUserId: remote.app_bot,
      accessToken: encryptPlaneToken(token.access_token),
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      healthState: "connected",
      installedById: member.id,
    };
    await prisma.planeInstallation.upsert({
      where: { organizationId: pending.organizationId },
      create: { ...data, organizationId: pending.organizationId },
      update: data,
    });
    return finish("plane=connected");
  } catch {
    return finish("error=plane_authorization_failed");
  }
}
