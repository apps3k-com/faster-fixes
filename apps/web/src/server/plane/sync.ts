import { prisma } from "@workspace/db";
import { getPlaneClient, isPlaneEnabled, PlaneApiError } from "./client";
import { handlePlaneCommentWebhook } from "./discussion";

export async function reconcilePlaneIssue(feedbackId: string) {
  if (!isPlaneEnabled()) return;
  const link = await prisma.feedbackPlaneIssueLink.findUnique({
    where: { feedbackId },
    include: { projectPlaneLink: { include: { planeInstallation: true } } },
  });
  if (
    !link?.projectPlaneLink.enabled ||
    link.projectPlaneLink.planeInstallation.healthState !== "connected"
  )
    return;
  const project = link.projectPlaneLink;
  const client = await getPlaneClient(project.planeInstallationId);
  let issue: {
    state?: string | { id: string };
    state_id?: string;
    project?: string;
    project_id?: string;
    deleted_at?: string | null;
    archived_at?: string | null;
  };
  try {
    issue = await client.request(
      `${client.projectPath(project.planeProjectId)}/work-items/${link.issueId}/`,
    );
  } catch (error) {
    if (error instanceof PlaneApiError && error.status === 404) return;
    throw error;
  }
  if (issue.deleted_at || issue.archived_at) return;
  const remoteProject = issue.project_id ?? issue.project;
  if (remoteProject && remoteProject !== project.planeProjectId) return;
  const stateId =
    issue.state_id ??
    (typeof issue.state === "string" ? issue.state : issue.state?.id);
  if (!stateId) return;
  const status = project.doneStateIds.includes(stateId)
    ? "resolved"
    : project.inProgressStateIds.includes(stateId)
      ? "in_progress"
      : undefined;
  // Direct persistence deliberately bypasses the FF-to-tracker event fanout.
  await prisma.$transaction([
    prisma.feedbackPlaneIssueLink.update({
      where: { id: link.id },
      data: {
        issueStateId: stateId,
        lastSyncAt: new Date(),
        lastSyncSource: "plane",
      },
    }),
    ...(status
      ? [
          prisma.feedback.update({
            where: { id: feedbackId },
            data: { status },
          }),
        ]
      : []),
  ]);
}

export async function processPlaneWebhook(eventId: string) {
  const stored = await prisma.planeWebhookEvent.findUnique({
    where: { id: eventId },
  });
  if (!stored || stored.processedAt || !isPlaneEnabled()) return;
  try {
    const payload = stored.payload as Record<string, unknown>;
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const previous = (payload.previous_attributes ?? {}) as Record<
      string,
      unknown
    >;
    if (stored.event.startsWith("workitem.comment.")) {
      await handlePlaneCommentWebhook(payload);
    } else if (
      ["workitem.created", "workitem.updated"].includes(stored.event)
    ) {
      const issueId = String(payload.entity_id ?? data.id ?? "");
      const projectId = data.project_id ?? data.project ?? previous.project_id;
      const links = await prisma.feedbackPlaneIssueLink.findMany({
        where: {
          issueId,
          projectPlaneLink: {
            ...(typeof projectId === "string"
              ? { planeProjectId: projectId }
              : {}),
            planeInstallation: { workspaceId: stored.workspaceId },
          },
        },
        select: { feedbackId: true },
      });
      for (const link of links) await reconcilePlaneIssue(link.feedbackId);
    }
    await prisma.planeWebhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), lastError: null },
    });
  } catch (error) {
    await prisma.planeWebhookEvent.update({
      where: { id: eventId },
      data: {
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Plane webhook processing failed.",
      },
    });
    throw error;
  }
}
