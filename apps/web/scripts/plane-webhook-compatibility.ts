import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire, Module } from "node:module";
import { normalizePlaneWebhook } from "../src/server/plane/normalize-webhook";

const require = createRequire(import.meta.url);
const workspaceId = "fixture-workspace";
const issueId = "fixture-issue";
const commentId = "fixture-comment";
const secret = "fixture-webhook-secret";
const inbox = new Map<string, Record<string, unknown>>();
const sent: unknown[] = [];
let installationReads = 0;
let commentLookups = 0;
let knownComment = true;
let dispatchUnavailable = false;
function mockModule(path: string, exports: unknown) {
  const resolved = require.resolve(path);
  const stubModule = new Module(resolved);
  stubModule.exports = exports;
  require.cache[resolved] = stubModule;
}
mockModule("@workspace/db", {
  prisma: {
    planeInstallation: {
      findUnique: async ({ where }: { where: { workspaceId: string } }) => {
        installationReads++;
        return where.workspaceId === workspaceId
          ? { healthState: "connected" }
          : null;
      },
    },
    planeWebhookEvent: {
      upsert: async ({
        where,
        create,
      }: {
        where: { id: string };
        create: Record<string, unknown>;
      }) => {
        if (!inbox.has(where.id)) inbox.set(where.id, create);
      },
    },
    feedbackDiscussionComment: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        commentLookups++;
        assert.deepEqual(where, {
          remoteCommentId: commentId,
          feedback: {
            planeIssueLink: {
              projectPlaneLink: { planeInstallation: { workspaceId } },
            },
          },
        });
        return knownComment
          ? { feedback: { planeIssueLink: { issueId } } }
          : null;
      },
    },
    feedbackPlaneIssueLink: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        assert.equal(where.issueId, issueId);
        assert.deepEqual(where.projectPlaneLink, {
          planeInstallation: { workspaceId },
        });
        return [{ feedbackId: "fixture-feedback" }];
      },
    },
  },
});
mockModule("../src/server/inngest/index.ts", {
  inngest: {
    send: async (event: unknown) => {
      if (dispatchUnavailable) throw new Error("Fixture dispatch outage");
      sent.push(event);
    },
  },
});
process.env.PLANE_ENABLED = "true";
process.env.PLANE_WEBHOOK_SECRET = secret;
const { POST } =
  require("../src/app/api/webhooks/plane/route.ts") as typeof import("../src/app/api/webhooks/plane/route");
const { getPlaneCommentWebhookTarget, handlePlaneCommentWebhook } =
  require("../src/server/plane/discussion.ts") as typeof import("../src/server/plane/discussion");

const legacy = {
  event: "issue",
  action: "updated",
  webhook_id: "fixture-webhook",
  workspace_id: workspaceId,
  data: { id: issueId, project: "fixture-project" },
};
async function deliver(
  payload: unknown,
  signatureValid = true,
  delivery = "delivery-one",
) {
  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", secret)
    .update(signatureValid ? raw : "different body")
    .digest("hex");
  return POST(
    new Request("https://fixture.invalid/api/webhooks/plane", {
      method: "POST",
      body: raw,
      headers: { "x-plane-signature": signature, "x-plane-delivery": delivery },
    }),
  );
}
async function main() {
  assert.equal((await deliver(legacy, false)).status, 401);
  assert.equal(
    installationReads,
    0,
    "Signature rejection must precede DB access.",
  );
  assert.equal((await deliver(legacy)).status, 202);
  assert.equal((await deliver(legacy, true, "retry-delivery")).status, 202);
  assert.equal(
    inbox.size,
    1,
    "Changing an unsigned delivery header must not bypass deduplication.",
  );
  assert.equal([...inbox.values()][0]!.event, "workitem.updated");

  for (const [action, expected] of [
    ["create", "created"],
    ["created", "created"],
    ["update", "updated"],
    ["updated", "updated"],
    ["delete", "deleted"],
    ["deleted", "deleted"],
  ]) {
    const normalized = normalizePlaneWebhook(
      JSON.stringify({
        ...legacy,
        event: "issue_comment",
        action,
        data: {
          id: commentId,
          issue: { id: issueId },
          project: { id: "fixture-project" },
        },
      }),
    );
    assert.equal(normalized.status, "accepted");
    if (normalized.status !== "accepted")
      throw new Error("Expected normalized comment");
    assert.equal(normalized.payload.event, `workitem.comment.${expected}`);
    assert.deepEqual(getPlaneCommentWebhookTarget(normalized.payload), {
      issueId,
      workspaceId,
      projectId: "fixture-project",
    });
  }

  const v2 = {
    version: "v2",
    event_id: "fixture-v2-event",
    event: "workitem.updated",
    workspace_id: workspaceId,
    entity_id: issueId,
    data: {},
  };
  assert.equal((await deliver(v2)).status, 202);
  assert.ok(inbox.has("fixture-v2-event"));
  const countBeforeIgnored = inbox.size;
  assert.equal((await deliver({ ...legacy, event: "project" })).status, 202);
  assert.equal(inbox.size, countBeforeIgnored);
  assert.equal((await deliver(null)).status, 400);
  assert.equal((await deliver({ ...legacy, version: "v3" })).status, 400);
  assert.equal(
    (await deliver({ ...legacy, workspace_id: "other-workspace" })).status,
    202,
  );
  assert.equal(
    inbox.size,
    countBeforeIgnored,
    "Unknown workspaces must not enter the inbox.",
  );

  dispatchUnavailable = true;
  assert.equal(
    (await deliver({ ...v2, event_id: "fixture-durable-event" })).status,
    202,
  );
  assert.ok(
    inbox.has("fixture-durable-event"),
    "Dispatch failure must leave a durable inbox record.",
  );
  dispatchUnavailable = false;

  const deleted = normalizePlaneWebhook(
    JSON.stringify({
      ...legacy,
      event: "issue_comment",
      action: "deleted",
      data: { id: commentId },
    }),
  );
  if (deleted.status !== "accepted")
    throw new Error("Expected normalized deletion");
  await handlePlaneCommentWebhook(deleted.payload);
  assert.equal(commentLookups, 1);
  assert.deepEqual(sent.at(-1), {
    name: "plane/discussion.changed",
    data: { feedbackId: "fixture-feedback" },
  });
  const sentBeforeUnknown = sent.length;
  knownComment = false;
  await handlePlaneCommentWebhook(deleted.payload);
  assert.equal(
    sent.length,
    sentBeforeUnknown,
    "An unknown comment must not reconcile unrelated issues.",
  );
  console.log(
    "Passed: signed legacy/v2 route compatibility, durable deduplication, scoped comment targets/deletions, signature and workspace rejection. DB and event transport mocked.",
  );
}
main();
