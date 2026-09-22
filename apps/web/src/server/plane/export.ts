import { randomUUID } from "node:crypto";
import type { Prisma } from "@workspace/db/generated/prisma/client";
import { prisma } from "@workspace/db";
import { formatDiagnosticTrailLines } from "@/app/_features/feedback/format-feedback-markdown";
import type { DiagnosticTrail } from "@fasterfixes/core";
import { formatIssueTitle } from "@/server/github/format-issue-body";
import { getSignedAssetUrl } from "@/server/storage/get-signed-asset-url";
import {
  decryptPlaneToken,
  encryptPlaneToken,
  escapePlaneHtml,
  getPlaneClient,
  isPlaneEnabled,
  PlaneApiError,
  type PlaneClient,
} from "./client";
import { normalizePlaneMember, type PlaneMember } from "./service";

export async function queuePlaneExport(
  feedbackId: string,
  manual = false,
  tx: Prisma.TransactionClient = prisma,
) {
  if (!isPlaneEnabled()) return null;
  const feedback = await tx.feedback.findUnique({
    where: { id: feedbackId },
    include: {
      project: {
        include: { planeLink: { include: { planeInstallation: true } } },
      },
    },
  });
  const link = feedback?.project.planeLink;
  if (
    !link?.enabled ||
    link.planeInstallation.healthState !== "connected" ||
    (!manual && link.exportMode === "manual")
  )
    return null;
  const job = await tx.planeExport.upsert({
    where: { feedbackId },
    create: { feedbackId, projectPlaneLinkId: link.id },
    update: {},
  });
  if (
    manual &&
    job.status !== "complete" &&
    (!job.lockedUntil || job.lockedUntil < new Date())
  ) {
    return tx.planeExport.update({
      where: { feedbackId },
      data: { nextAttemptAt: new Date(), lastError: null, status: "pending" },
    });
  }
  return job;
}

export async function resumePlaneScreenshotExport(
  feedbackId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  // A late widget image may resume an existing export, but must never create a manual export intent.
  return tx.planeExport.updateMany({
    where: {
      feedbackId,
      screenshotStatus: { not: "complete" },
      status: { not: "needs_attention" },
      feedback: { screenshotId: { not: null } },
    },
    data: {
      screenshotStatus: "pending",
      status: "pending",
      nextAttemptAt: new Date(),
    },
  });
}

type PlaneIssue = {
  id: string;
  description_html?: string;
  sequence_id?: number;
  state?: string | { id: string };
  external_id?: string;
  external_source?: string;
  project?: string;
  project_id?: string;
  archived_at?: string | null;
  deleted_at?: string | null;
};
type Intake = { id: string; issue: PlaneIssue };
type Attachment = {
  id: string;
  external_id?: string;
  external_source?: string;
  is_uploaded?: boolean;
};

type UploadCredentials = {
  asset_id: string;
  upload_data: { url: string; fields: Record<string, string> };
};

async function uploadAttachment(
  client: PlaneClient,
  issuePath: string,
  correlationId: string,
  name: string,
  file: Blob,
  storedCredentials: string | null,
  save: (id: string, credentials: string | null) => Promise<unknown>,
) {
  const path = `${issuePath}/attachments/`;
  const existing = (await client.list<Attachment>(path)).find(
    (item) =>
      item.external_source === "faster-fixes" &&
      (item.external_id === correlationId ||
        item.external_id?.startsWith(`${correlationId}:`)) &&
      item.is_uploaded !== false,
  );
  if (existing) {
    await save(existing.id, null);
    return existing.id;
  }
  // Plane cannot refresh credentials for an unfinished asset. Persist them encrypted so a retry resumes the binary transfer; expired attempts remain invisible in Plane.
  const credentials = storedCredentials
    ? (JSON.parse(decryptPlaneToken(storedCredentials)) as UploadCredentials)
    : await client.request<UploadCredentials>(path, "POST", {
        name,
        type: file.type,
        size: file.size,
        external_id: `${correlationId}:${randomUUID()}`,
        external_source: "faster-fixes",
      });
  if (
    !credentials.asset_id ||
    !credentials.upload_data?.url ||
    !credentials.upload_data.fields
  )
    throw new Error("Plane did not return upload credentials.");
  await save(
    credentials.asset_id,
    encryptPlaneToken(JSON.stringify(credentials)),
  );
  const url = new URL(credentials.upload_data.url);
  if (url.protocol !== "https:")
    throw new Error("Plane returned an insecure upload URL.");
  const body = new FormData();
  for (const [key, value] of Object.entries(credentials.upload_data.fields))
    body.append(key, value);
  body.append("file", file, name);
  const response = await fetch(url, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(60_000),
    redirect: "error",
  });
  if (!response.ok) {
    if (response.status === 403) await save(credentials.asset_id, null);
    throw new Error(
      `Plane attachment upload failed (HTTP ${response.status}).`,
    );
  }
  await client.request(`${path}${credentials.asset_id}/`, "PATCH", {
    is_uploaded: true,
  });
  await save(credentials.asset_id, null);
  return credentials.asset_id;
}

export async function processPlaneExport(feedbackId: string) {
  if (!isPlaneEnabled()) return;
  const lease = new Date(Date.now() + 300_000);
  const claim = await prisma.planeExport.updateMany({
    where: {
      feedbackId,
      status: { not: "complete" },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
    },
    data: {
      status: "processing",
      lockedUntil: lease,
      attempts: { increment: 1 },
    },
  });
  if (!claim.count) return;
  try {
    const job = await prisma.planeExport.findUniqueOrThrow({
      where: { feedbackId },
      include: {
        projectPlaneLink: { include: { planeInstallation: true } },
        feedback: {
          include: { reviewer: true, screenshot: true, planeIssueLink: true },
        },
      },
    });
    const link = job.projectPlaneLink;
    if (!link.enabled || link.planeInstallation.healthState !== "connected") {
      await prisma.planeExport.update({
        where: { feedbackId },
        data: { status: "pending" },
      });
      return;
    }
    const feedback = job.feedback;
    if (!link.customFieldId || !link.workItemTypeId) {
      throw new Error(
        "Choose a Plane work item type and custom text field before exporting feedback.",
      );
    }
    const client = await getPlaneClient(link.planeInstallationId);
    const projectPath = client.projectPath(link.planeProjectId);
    let remoteLink = feedback.planeIssueLink;
    if (!remoteLink) {
      const correlation = `external_source=faster-fixes&external_id=${encodeURIComponent(feedbackId)}`;
      let matches: PlaneIssue[];
      try {
        // Plane treats external correlation as a detail lookup: one object or 404.
        matches = [
          await client.request<PlaneIssue>(
            `${projectPath}/work-items/?${correlation}`,
          ),
        ];
      } catch (error) {
        if (!(error instanceof PlaneApiError) || error.status !== 404)
          throw error;
        // One successful page distinguishes a missing match from an invalid project without scanning every issue.
        await client.request(`${projectPath}/work-items/?per_page=1`);
        matches = [];
      }
      let intakeId: string | undefined;
      let issue = matches.find(
        (item) =>
          item.external_id === feedbackId &&
          item.external_source === "faster-fixes",
      );
      if (!issue && link.exportMode === "intake") {
        const intakes = await client.list<Intake>(
          `${projectPath}/intake-issues/`,
        );
        const found = intakes.find(
          (item) =>
            (item.issue?.external_id === feedbackId &&
              item.issue.external_source === "faster-fixes") ||
            item.issue?.description_html?.includes(
              `Faster Fixes reference: ${feedbackId}`,
            ),
        );
        issue = found?.issue;
        intakeId = found?.id;
      }
      if (!issue && job.createAttemptedAt) {
        await prisma.planeExport.update({
          where: { feedbackId },
          data: {
            status: "needs_attention",
            lastError:
              "The previous creation result is uncertain. No matching Plane issue was found. Check Plane before resetting the export.",
          },
        });
        return;
      }
      if (!issue) {
        const members = (
          await client.list<PlaneMember>(`${projectPath}/project-members/`)
        ).map(normalizePlaneMember);
        if (
          !members.some(
            (member) =>
              member.id === link.genericAssigneeId &&
              (member.role === null || member.role >= 15),
          )
        )
          throw new Error(
            "The generic Plane assignee is not a project member.",
          );
        const email = feedback.reviewer.email?.trim().toLowerCase();
        const candidates = email
          ? members.filter(
              (member) =>
                (member.role === null || member.role >= 15) &&
                member.email?.trim().toLowerCase() === email,
            )
          : [];
        const matched =
          link.assignmentMode === "email" && candidates.length === 1
            ? candidates[0]
            : undefined;
        const assignmentNote =
          link.assignmentMode === "email" && !matched
            ? "No unique project member matched the reviewer email; the generic assignee was used."
            : null;
        const base = (
          process.env.BETTER_AUTH_URL ??
          process.env.BASE_URL ??
          ""
        ).replace(/\/$/, "");
        const body = {
          name: formatIssueTitle(feedback.comment),
          description_html: `<p>${escapePlaneHtml(feedback.comment).replace(/\n/g, "<br>")}</p><p>Page: ${escapePlaneHtml(feedback.pageUrl)}</p><p>Reported by ${escapePlaneHtml(feedback.reviewer.name)}</p><p>Faster Fixes reference: ${feedbackId}</p><p><a href="${escapePlaneHtml(`${base}/api/plane/feedback/${feedback.id}`)}">Faster Fixes ${feedback.id}</a></p>`,
          external_source: "faster-fixes",
          external_id: feedbackId,
          assignees: [matched?.id ?? link.genericAssigneeId],
          ...(link.workItemTypeId ? { type_id: link.workItemTypeId } : {}),
          ...(link.defaultStateId && link.exportMode !== "intake"
            ? { state: link.defaultStateId }
            : {}),
        };
        await prisma.planeExport.update({
          where: { feedbackId },
          data: { createAttemptedAt: new Date(), assignmentNote },
        });
        try {
          if (link.exportMode === "intake") {
            const result = await client.request<Intake>(
              `${projectPath}/intake-issues/`,
              "POST",
              { issue: body },
            );
            issue = result.issue;
            intakeId = result.id;
          } else
            issue = await client.request<PlaneIssue>(
              `${projectPath}/work-items/`,
              "POST",
              body,
            );
        } catch (error) {
          if (
            error instanceof PlaneApiError &&
            error.status >= 400 &&
            error.status < 500 &&
            ![408, 409].includes(error.status)
          )
            await prisma.planeExport.update({
              where: { feedbackId },
              data: { createAttemptedAt: null },
            });
          throw error;
        }
      }
      if (!issue?.id) throw new Error("Plane did not return a work item ID.");
      remoteLink = await prisma.feedbackPlaneIssueLink.create({
        data: {
          feedbackId,
          projectPlaneLinkId: link.id,
          issueId: issue.id,
          intakeId,
          issueIdentifier: issue.sequence_id
            ? `${link.planeProjectIdentifier}-${issue.sequence_id}`
            : issue.id,
          issueUrl: `https://app.plane.so/${encodeURIComponent(link.planeInstallation.workspaceSlug)}/projects/${link.planeProjectId}/issues/${issue.id}`,
          issueStateId:
            typeof issue.state === "string" ? issue.state : issue.state?.id,
        },
      });
    }
    const issuePath = `${projectPath}/work-items/${remoteLink.issueId}`;
    if (!job.referenceWritten) {
      if (remoteLink.intakeId) {
        const members = (
          await client.list<PlaneMember>(`${projectPath}/project-members/`)
        ).map(normalizePlaneMember);
        const candidates = feedback.reviewer.email
          ? members.filter(
              (member) =>
                (member.role === null || member.role >= 15) &&
                member.email?.trim().toLowerCase() ===
                  feedback.reviewer.email?.trim().toLowerCase(),
            )
          : [];
        const assignee =
          link.assignmentMode === "email" && candidates.length === 1
            ? candidates[0]!.id
            : link.genericAssigneeId;
        // Intake creation only persists title and description; assign and correlate the underlying work item afterwards.
        await client.request(`${issuePath}/`, "PATCH", {
          external_source: "faster-fixes",
          external_id: feedbackId,
          assignees: [assignee],
          ...(link.workItemTypeId ? { type_id: link.workItemTypeId } : {}),
        });
      }
      if (!link.customFieldId)
        throw new Error(
          "Choose a Plane custom text field for the Faster Fixes ID.",
        );
      await client.request(
        `${issuePath}/work-item-properties/${link.customFieldId}/values/`,
        "POST",
        {
          value: feedbackId,
          external_id: feedbackId,
          external_source: "faster-fixes",
        },
      );
      await prisma.planeExport.update({
        where: { feedbackId },
        data: { referenceWritten: true },
      });
    }
    if (job.screenshotStatus !== "complete") {
      const latest = await prisma.feedback.findUniqueOrThrow({
        where: { id: feedbackId },
        select: { screenshot: true },
      });
      if (latest.screenshot) {
        const response = await fetch(
          await getSignedAssetUrl(latest.screenshot),
          { signal: AbortSignal.timeout(30_000) },
        );
        if (!response.ok)
          throw new Error("The feedback screenshot could not be downloaded.");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/"))
          throw new Error("The feedback screenshot is not an image.");
        await uploadAttachment(
          client,
          issuePath,
          `${feedbackId}:screenshot`,
          `faster-fixes-${feedbackId}.png`,
          blob,
          job.screenshotUploadData,
          (id, credentials) =>
            prisma.planeExport.update({
              where: { feedbackId },
              data: {
                screenshotAttachmentId: id,
                screenshotUploadData: credentials,
              },
            }),
        );
        await prisma.planeExport.update({
          where: { feedbackId },
          data: { screenshotStatus: "complete" },
        });
      } else {
        // The widget uploads separately. Do not overwrite a pending stage if its image arrived after our read.
        await prisma.planeExport.updateMany({
          where: { feedbackId, feedback: { screenshotId: null } },
          data: { screenshotStatus: "absent" },
        });
      }
    }
    if (
      job.diagnosticsStatus !== "complete" &&
      job.diagnosticsStatus !== "absent"
    ) {
      const diagnostics = formatDiagnosticTrailLines(
        feedback.diagnosticTrail as DiagnosticTrail | null,
      );
      const environment = [
        feedback.browserName &&
          `Browser: ${feedback.browserName} ${feedback.browserVersion ?? ""}`,
        feedback.os && `OS: ${feedback.os}`,
        feedback.viewportWidth &&
          `Viewport: ${feedback.viewportWidth} × ${feedback.viewportHeight}`,
      ].filter(Boolean);
      if (diagnostics.length || environment.length) {
        const markdown = [
          `# Faster Fixes diagnostics`,
          `Feedback: ${feedbackId}`,
          "",
          ...environment,
          "",
          ...diagnostics,
        ].join("\n");
        await uploadAttachment(
          client,
          issuePath,
          `${feedbackId}:diagnostics`,
          `faster-fixes-${feedbackId}-diagnostics.md`,
          new Blob([markdown], { type: "text/markdown" }),
          job.diagnosticsUploadData,
          (id, credentials) =>
            prisma.planeExport.update({
              where: { feedbackId },
              data: {
                diagnosticsAttachmentId: id,
                diagnosticsUploadData: credentials,
              },
            }),
        );
      }
      await prisma.planeExport.update({
        where: { feedbackId },
        data: {
          diagnosticsStatus:
            diagnostics.length || environment.length ? "complete" : "absent",
        },
      });
    }
    const completed = await prisma.planeExport.updateMany({
      where: {
        feedbackId,
        lockedUntil: lease,
        OR: [
          { screenshotStatus: "complete" },
          { screenshotStatus: "absent", feedback: { screenshotId: null } },
        ],
      },
      data: { status: "complete", lastError: null },
    });
    if (!completed.count) {
      await prisma.planeExport.updateMany({
        where: { feedbackId, lockedUntil: lease },
        data: { status: "pending", nextAttemptAt: new Date() },
      });
    }
    return remoteLink;
  } catch (error) {
    const job = await prisma.planeExport.findUnique({ where: { feedbackId } });
    await prisma.planeExport.update({
      where: { feedbackId },
      data: {
        status: "failed",
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Plane export failed.",
        nextAttemptAt: new Date(
          Date.now() +
            Math.min(3600, 30 * 2 ** Math.min(job?.attempts ?? 1, 7)) * 1000,
        ),
      },
    });
    throw error;
  } finally {
    await prisma.planeExport.updateMany({
      where: { feedbackId, lockedUntil: lease },
      data: { lockedUntil: null },
    });
  }
}
