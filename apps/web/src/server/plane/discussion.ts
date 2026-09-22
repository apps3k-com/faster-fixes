import { TRPCError } from "@trpc/server";
import { prisma } from "@workspace/db";
import { inngest } from "@/server/inngest";
import { getPlaneClient, isPlaneEnabled, PlaneApiError } from "./client";
import { normalizePlaneMember, type PlaneMember } from "./service";

async function requireDiscussionMember(feedbackId: string, userId: string) {
  const feedback = await prisma.feedback.findFirst({
    where: {
      id: feedbackId,
      project: { organization: { members: { some: { userId } } } },
    },
    select: { id: true },
  });
  if (!feedback)
    throw new TRPCError({ code: "NOT_FOUND", message: "Feedback not found." });
}

export async function getDiscussionComments(
  feedbackId: string,
  userId: string,
) {
  await requireDiscussionMember(feedbackId, userId);
  const comments = await prisma.feedbackDiscussionComment.findMany({
    where: { feedbackId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      body: true,
      authorName: true,
      authorUserId: true,
      origin: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      syncStatus: true,
    },
  });
  return comments.map(({ authorUserId, ...comment }) => ({
    ...comment,
    body: comment.deletedAt ? "" : comment.body,
    canEdit:
      comment.origin === "FF" && authorUserId === userId && !comment.deletedAt,
  }));
}

async function notifyDiscussionChanged(feedbackId: string) {
  // The database record remains pending if the event service is unavailable.
  await inngest
    .send({ name: "plane/discussion.changed", data: { feedbackId } })
    .catch(() => {});
}

export async function createDiscussionComment(
  input: { feedbackId: string; body: string },
  user: { id: string; name: string },
) {
  await requireDiscussionMember(input.feedbackId, user.id);
  const comment = await prisma.feedbackDiscussionComment.create({
    data: {
      feedbackId: input.feedbackId,
      body: input.body,
      authorUserId: user.id,
      authorName: user.name,
      origin: "FF",
    },
  });
  await notifyDiscussionChanged(input.feedbackId);
  return { id: comment.id };
}

async function requireCommentAuthor(
  input: { feedbackId: string; commentId: string },
  userId: string,
) {
  await requireDiscussionMember(input.feedbackId, userId);
  const comment = await prisma.feedbackDiscussionComment.findFirst({
    where: {
      id: input.commentId,
      feedbackId: input.feedbackId,
      authorUserId: userId,
      origin: "FF",
      deletedAt: null,
    },
  });
  if (!comment)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the original author can change this comment.",
    });
  return comment;
}

export async function updateDiscussionComment(
  input: { feedbackId: string; commentId: string; body: string },
  userId: string,
) {
  await requireCommentAuthor(input, userId);
  await prisma.feedbackDiscussionComment.update({
    where: { id: input.commentId },
    data: {
      body: input.body,
      syncStatus: "pending",
      syncError: null,
    },
  });
  await notifyDiscussionChanged(input.feedbackId);
  return { id: input.commentId };
}

export async function deleteDiscussionComment(
  input: { feedbackId: string; commentId: string },
  userId: string,
) {
  await requireCommentAuthor(input, userId);
  await prisma.feedbackDiscussionComment.update({
    where: { id: input.commentId },
    data: {
      body: "",
      deletedAt: new Date(),
      syncStatus: "pending",
      syncError: null,
    },
  });
  await notifyDiscussionChanged(input.feedbackId);
  return { id: input.commentId };
}

type PlaneComment = {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  comment_stripped?: string;
  comment_html?: string;
  external_source?: string;
  external_id?: string;
  created_by?: string;
  created_by_id?: string;
  actor_id?: string;
  actor?: string;
  actor_detail?: {
    display_name?: string;
    first_name?: string;
    last_name?: string;
  };
};

function getRemoteAuthorId(comment: PlaneComment) {
  return (
    comment.created_by ??
    comment.created_by_id ??
    comment.actor_id ??
    comment.actor
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

function getRemoteText(comment: PlaneComment) {
  // Remote markup is displayed as text; it never reaches an HTML rendering sink.
  return (
    comment.comment_stripped ??
    (comment.comment_html ?? "").replace(/<[^>]*>/g, "")
  );
}

export async function syncPlaneComments(feedbackId: string) {
  if (!isPlaneEnabled()) return;
  const issueLink = await prisma.feedbackPlaneIssueLink.findUnique({
    where: { feedbackId },
    include: { projectPlaneLink: { include: { planeInstallation: true } } },
  });
  const config = issueLink?.projectPlaneLink;
  if (
    !issueLink ||
    !config?.enabled ||
    !config.commentsEnabled ||
    !config.commentsEnabledAt ||
    config.planeInstallation.healthState !== "connected"
  )
    return;
  const now = new Date();
  let leaseUntil = new Date(now.getTime() + 5 * 60_000);
  const lease = await prisma.feedbackPlaneIssueLink.updateMany({
    where: {
      id: issueLink.id,
      OR: [
        { commentSyncLockedUntil: null },
        { commentSyncLockedUntil: { lt: now } },
      ],
    },
    data: { commentSyncLockedUntil: leaseUntil },
  });
  if (!lease.count) return;
  try {
    const client = await getPlaneClient(config.planeInstallationId);
    const path = `${client.projectPath(config.planeProjectId)}/work-items/${encodeURIComponent(issueLink.issueId)}/comments/`;
    const remoteComments = await client.list<PlaneComment>(path);
    const remoteIds = new Set(remoteComments.map((comment) => comment.id));
    const members = remoteComments.some(
      (comment) =>
        !comment.actor_detail &&
        getRemoteAuthorId(comment) !== config.planeInstallation.botUserId,
    )
      ? (
          await client.list<PlaneMember>(`${client.workspacePath}/members/`)
        ).map(normalizePlaneMember)
      : [];
    const renewLease = async () => {
      const extended = new Date(Date.now() + 5 * 60_000);
      const held = await prisma.feedbackPlaneIssueLink.updateMany({
        where: { id: issueLink.id, commentSyncLockedUntil: leaseUntil },
        data: { commentSyncLockedUntil: extended },
      });
      if (!held.count) throw new Error("Plane discussion lease expired.");
      leaseUntil = extended;
    };
    for (const remote of remoteComments) {
      await renewLease();
      if (
        remote.external_source === "faster-fixes" &&
        remote.external_id &&
        getRemoteAuthorId(remote) === config.planeInstallation.botUserId
      ) {
        await prisma.feedbackDiscussionComment.updateMany({
          where: {
            id: remote.external_id,
            feedbackId,
            origin: "FF",
            remoteCommentId: null,
          },
          data: { remoteCommentId: remote.id },
        });
        continue;
      }
      const existing = await prisma.feedbackDiscussionComment.findUnique({
        where: {
          feedbackId_remoteCommentId: {
            feedbackId,
            remoteCommentId: remote.id,
          },
        },
      });
      if (existing?.origin === "FF") continue;
      const createdAt = new Date(remote.created_at);
      const updatedAt = new Date(remote.updated_at);
      if (
        !Number.isFinite(createdAt.getTime()) ||
        !Number.isFinite(updatedAt.getTime()) ||
        (!existing && createdAt < config.commentsEnabledAt)
      )
        continue;
      if (existing?.remoteUpdatedAt && existing.remoteUpdatedAt > updatedAt)
        continue;
      const author = remote.actor_detail;
      const authorName =
        author?.display_name ||
        [author?.first_name, author?.last_name].filter(Boolean).join(" ") ||
        members.find((member) => member.id === getRemoteAuthorId(remote))
          ?.name ||
        "Plane member";
      const data = {
        body: remote.deleted_at ? "" : getRemoteText(remote),
        authorName,
        remoteUpdatedAt: updatedAt,
        deletedAt: remote.deleted_at ? new Date(remote.deleted_at) : null,
        syncStatus: "synced",
        lastSyncedAt: now,
      };
      await prisma.feedbackDiscussionComment.upsert({
        where: {
          feedbackId_remoteCommentId: {
            feedbackId,
            remoteCommentId: remote.id,
          },
        },
        create: {
          ...data,
          feedbackId,
          remoteCommentId: remote.id,
          origin: "PLANE",
          createdAt,
        },
        update: data,
      });
    }
    const imported = await prisma.feedbackDiscussionComment.findMany({
      where: { feedbackId, origin: "PLANE", deletedAt: null },
      select: { id: true, remoteCommentId: true },
    });
    for (const comment of imported) {
      if (comment.remoteCommentId && !remoteIds.has(comment.remoteCommentId))
        await prisma.feedbackDiscussionComment.update({
          where: { id: comment.id },
          data: {
            body: "",
            deletedAt: now,
            syncStatus: "synced",
            lastSyncedAt: now,
          },
        });
    }
    const pending = await prisma.feedbackDiscussionComment.findMany({
      where: {
        feedbackId,
        origin: "FF",
        syncStatus: { in: ["pending", "error"] },
        OR: [
          { createdAt: { gte: config.commentsEnabledAt } },
          { remoteCommentId: { not: null } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    for (const comment of pending) {
      await renewLease();
      try {
        const body = {
          comment_html: `<p><strong>${escapeHtml(comment.authorName)} · Faster Fixes</strong></p><p>${escapeHtml(comment.deletedAt ? "Comment removed by its author." : comment.body).replace(/\n/g, "<br />")}</p>`,
          access: "INTERNAL",
          external_source: "faster-fixes",
          external_id: comment.id,
        };
        if (!comment.remoteCommentId && comment.deletedAt) {
          await prisma.feedbackDiscussionComment.updateMany({
            where: { id: comment.id, updatedAt: comment.updatedAt },
            data: { syncStatus: "synced", lastSyncedAt: now },
          });
          continue;
        }
        const remote = comment.remoteCommentId
          ? await client.request<PlaneComment>(
              `${path}${encodeURIComponent(comment.remoteCommentId)}/`,
              "PATCH",
              body,
            )
          : await client.request<PlaneComment>(path, "POST", body);
        await prisma.feedbackDiscussionComment.updateMany({
          where: { id: comment.id, updatedAt: comment.updatedAt },
          data: {
            remoteCommentId: remote.id,
            syncStatus: "synced",
            syncError: null,
            lastSyncedAt: new Date(),
          },
        });
      } catch (error) {
        if (
          error instanceof PlaneApiError &&
          error.status === 404 &&
          comment.remoteCommentId
        ) {
          await prisma.feedbackDiscussionComment.updateMany({
            where: { id: comment.id, updatedAt: comment.updatedAt },
            data: {
              syncStatus: "remote_missing",
              syncError: "The linked comment was removed in Plane.",
            },
          });
          continue;
        }
        // Raw provider errors may contain credentials or private request data.
        await prisma.feedbackDiscussionComment.updateMany({
          where: { id: comment.id, updatedAt: comment.updatedAt },
          data: {
            syncStatus: "error",
            syncError:
              "Plane comment synchronization failed. The next reconciliation will retry.",
          },
        });
      }
    }
  } finally {
    await prisma.feedbackPlaneIssueLink.updateMany({
      where: { id: issueLink.id, commentSyncLockedUntil: leaseUntil },
      data: { commentSyncLockedUntil: null },
    });
  }
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getPlaneCommentWebhookTarget(payload: unknown) {
  const envelope = getRecord(payload);
  const data = getRecord(envelope.data);
  const previous = getRecord(envelope.previous_attributes);
  const comment = getRecord(data.comment ?? previous.comment);
  const issueId =
    comment.issue_id ??
    data.issue_id ??
    data.issue ??
    data.work_item ??
    previous.issue_id ??
    previous.issue ??
    (envelope.entity_type === "issue" ? envelope.entity_id : undefined);
  const projectId =
    data.project_id ?? data.project ?? previous.project_id ?? previous.project;
  const workspaceId =
    envelope.workspace_id ?? data.workspace_id ?? data.workspace;
  if (typeof issueId !== "string" || typeof workspaceId !== "string")
    return null;
  return {
    issueId,
    workspaceId,
    projectId: typeof projectId === "string" ? projectId : undefined,
  };
}

export async function handlePlaneCommentWebhook(payload: unknown) {
  const target = getPlaneCommentWebhookTarget(payload);
  if (!target) return;
  // V2 comment events can omit the project. The stored link supplies it when
  // reconciling; only links in the signed event's workspace are candidates.
  const links = await prisma.feedbackPlaneIssueLink.findMany({
    where: {
      issueId: target.issueId,
      projectPlaneLink: {
        ...(target.projectId ? { planeProjectId: target.projectId } : {}),
        planeInstallation: { workspaceId: target.workspaceId },
      },
    },
    select: { feedbackId: true },
  });
  for (const link of links) await notifyDiscussionChanged(link.feedbackId);
}
