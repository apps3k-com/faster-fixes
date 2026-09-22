import { auth } from "@/server/auth";
import { prisma } from "@workspace/db";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ feedbackId: string }> },
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    const login = new URL("/login", req.url);
    login.searchParams.set("nextUrl", req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  const { feedbackId } = await context.params;
  const feedback = await prisma.feedback.findFirst({
    where: {
      id: feedbackId,
      project: {
        organization: { members: { some: { userId: session.user.id } } },
      },
    },
    select: { projectId: true, project: { select: { organizationId: true } } },
  });
  if (!feedback)
    return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  // A tracker deep link must select its organization and project, not whichever was last open.
  const switched = await auth.api.setActiveOrganization({
    headers: req.headers,
    body: { organizationId: feedback.project.organizationId },
    asResponse: true,
  });
  if (!switched.ok)
    return NextResponse.json(
      { error: "Could not open the feedback organization." },
      { status: 403 },
    );
  const response = NextResponse.redirect(
    new URL(`/inbox?feedbackId=${encodeURIComponent(feedbackId)}`, req.url),
  );
  for (const cookie of switched.headers.getSetCookie())
    response.headers.append("set-cookie", cookie);
  response.cookies.set("active-project-id", feedback.projectId, {
    path: "/",
    sameSite: "lax",
    maxAge: 31536000,
  });
  return response;
}
