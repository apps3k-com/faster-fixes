import { prisma } from "@workspace/db";
import { isPlaneEnabled } from "@/server/plane/client";
import { processPlaneExport } from "@/server/plane/export";
import { processPlaneWebhook, reconcilePlaneIssue } from "@/server/plane/sync";
import { inngest } from "./index";

export const exportPlaneFeedback = inngest.createFunction(
  {
    id: "export-plane-feedback",
    retries: 3,
    concurrency: { key: "event.data.feedbackId", limit: 1 },
    triggers: [
      { event: "plane/export.requested" },
      { event: "feedback/created" },
    ],
  },
  async ({ event }) => processPlaneExport(event.data.feedbackId),
);

export const receivePlaneWebhook = inngest.createFunction(
  {
    id: "receive-plane-webhook",
    retries: 3,
    concurrency: { key: "event.data.eventId", limit: 1 },
    triggers: [{ event: "plane/webhook.received" }],
  },
  async ({ event }) => processPlaneWebhook(event.data.eventId),
);

export const sweepPlaneSync = inngest.createFunction(
  {
    id: "sweep-plane-sync",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    if (!isPlaneEnabled()) return { skipped: "disabled" };
    const pending = await step.run("find-pending", async () => {
      const [exports, webhooks] = await Promise.all([
        prisma.planeExport.findMany({
          where: {
            status: { in: ["pending", "failed", "processing"] },
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
            nextAttemptAt: { lte: new Date() },
            projectPlaneLink: {
              enabled: true,
              planeInstallation: { healthState: "connected" },
            },
          },
          select: { feedbackId: true },
          take: 100,
          orderBy: { nextAttemptAt: "asc" },
        }),
        prisma.planeWebhookEvent.findMany({
          where: { processedAt: null },
          select: { id: true },
          take: 100,
          orderBy: { createdAt: "asc" },
        }),
      ]);
      return { exports, webhooks };
    });
    if (pending.exports.length)
      await step.sendEvent(
        "export",
        pending.exports.map((item) => ({
          name: "plane/export.requested",
          data: { feedbackId: item.feedbackId },
        })),
      );
    if (pending.webhooks.length)
      await step.sendEvent(
        "webhooks",
        pending.webhooks.map((item) => ({
          name: "plane/webhook.received",
          data: { eventId: item.id },
        })),
      );
    const links = await step.run("find-stale-issues", () =>
      prisma.feedbackPlaneIssueLink.findMany({
        where: {
          projectPlaneLink: {
            enabled: true,
            planeInstallation: { healthState: "connected" },
          },
          OR: [
            { lastSyncAt: null },
            { lastSyncAt: { lt: new Date(Date.now() - 15 * 60_000) } },
          ],
        },
        select: { feedbackId: true },
        orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
        take: 100,
      }),
    );
    for (const link of links)
      await step.run(`reconcile-${link.feedbackId}`, () =>
        reconcilePlaneIssue(link.feedbackId),
      );
    return {
      exports: pending.exports.length,
      webhooks: pending.webhooks.length,
      reconciled: links.length,
    };
  },
);
