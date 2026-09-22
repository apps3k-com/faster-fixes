import { prisma } from "@workspace/db";
import { isPlaneEnabled } from "@/server/plane/client";
import { syncPlaneComments } from "@/server/plane/discussion";
import { inngest } from "./index";

export const syncPlaneDiscussion = inngest.createFunction(
  {
    id: "sync-plane-discussion",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.feedbackId" },
    triggers: [{ event: "plane/discussion.changed" }],
  },
  async ({ event }) => {
    if (typeof event.data.feedbackId === "string")
      await syncPlaneComments(event.data.feedbackId);
  },
);

export const reconcilePlaneDiscussions = inngest.createFunction(
  {
    id: "reconcile-plane-discussions",
    retries: 2,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    if (!isPlaneEnabled()) return;
    let cursor: string | undefined;
    do {
      const links = await step.run(`links-${cursor ?? "start"}`, () =>
        prisma.feedbackPlaneIssueLink.findMany({
          where: {
            projectPlaneLink: {
              enabled: true,
              commentsEnabled: true,
              planeInstallation: { healthState: "connected" },
            },
          },
          select: { id: true, feedbackId: true },
          orderBy: { id: "asc" },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      );
      if (!links.length) break;
      await step.sendEvent(
        `queue-${cursor ?? "start"}`,
        links.map((link) => ({
          name: "plane/discussion.changed",
          data: { feedbackId: link.feedbackId },
        })),
      );
      cursor = links.at(-1)?.id;
    } while (cursor);
  },
);
