import { auth } from "@/server/auth";
import {
  createOAuthState,
  setOAuthStateCookie,
} from "@/server/oauth/state-cookie";
import {
  isPlaneEnabled,
  PLANE_ORIGIN,
  PLANE_SCOPES,
  planeRedirectUri,
} from "@/server/plane/client";
import { prisma } from "@workspace/db";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (!isPlaneEnabled() || !process.env.PLANE_CLIENT_ID)
    return NextResponse.json(
      { error: "Plane integration is disabled." },
      { status: 404 },
    );
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const organization = await auth.api.getFullOrganization({
    headers: req.headers,
  });
  const member =
    organization &&
    (await prisma.member.findFirst({
      where: {
        organizationId: organization.id,
        userId: session.user.id,
        role: { in: ["owner", "admin"] },
      },
    }));
  if (!member)
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  const state = createOAuthState();
  await prisma.planeOAuthState.create({
    data: {
      id: state,
      organizationId: member.organizationId,
      userId: session.user.id,
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  const url = new URL(`${PLANE_ORIGIN}/auth/o/authorize-app/`);
  url.search = new URLSearchParams({
    client_id: process.env.PLANE_CLIENT_ID,
    response_type: "code",
    redirect_uri: planeRedirectUri(),
    scope: PLANE_SCOPES,
    state,
  }).toString();
  const response = NextResponse.redirect(url);
  setOAuthStateCookie(
    response,
    { name: "plane_oauth_state", maxAgeSeconds: 600 },
    state,
  );
  return response;
}
