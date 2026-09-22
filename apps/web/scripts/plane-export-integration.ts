import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire, Module } from "node:module";

// This harness intentionally keeps the API transport mocked; only persistence and service orchestration are real.
const database = new URL(process.env.DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  database.pathname !== "/ff_plane_e2e"
) {
  throw new Error("Use the dedicated local ff_plane_e2e database.");
}
process.env.PLANE_ENABLED = "true";
process.env.PLANE_TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
process.env.BETTER_AUTH_URL = "http://localhost:3100";

const require = createRequire(import.meta.url);
const { prisma } = require("@workspace/db") as typeof import("@workspace/db");
const { encryptPlaneToken } =
  require("../src/server/plane/client.ts") as typeof import("../src/server/plane/client");
// The upload library is ESM-only; replace only its signed-URL boundary for this CommonJS service harness.
const storagePath =
  require.resolve("../src/server/storage/get-signed-asset-url.ts");
const storageModule = new Module(storagePath);
storageModule.exports = {
  getSignedAssetUrl: async () =>
    "https://fixture.backblazeb2.com/screenshot.png",
};
require.cache[storagePath] = storageModule;
const { queuePlaneExport, processPlaneExport, resumePlaneScreenshotExport } =
  require("../src/server/plane/export.ts") as typeof import("../src/server/plane/export");
const { processPlaneWebhook } =
  require("../src/server/plane/sync.ts") as typeof import("../src/server/plane/sync");

type RemoteIssue = {
  id: string;
  sequence_id: number;
  project: string;
  state: string;
  description_html: string;
  external_id?: string;
  external_source?: string;
  assignees?: string[];
  type_id?: string;
  intakeId?: string;
};
type RemoteAttachment = {
  id: string;
  issueId: string;
  external_id: string;
  external_source: string;
  type: string;
  name: string;
  is_uploaded: boolean;
  bytes?: Uint8Array;
  text?: string;
};
const remoteIssues = new Map<string, RemoteIssue>();
const attachments = new Map<string, RemoteAttachment>();
const references = new Map<string, string>();
const calls: { method: string; path: string }[] = [];
const remoteProjectId = randomUUID();
const genericUserId = randomUUID();
const reviewerUserId = randomUUID();
const fieldId = randomUUID();
const typeId = randomUUID();
const initialState = randomUUID();
const progressState = randomUUID();
const doneState = randomUUID();
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBf8AAAAASUVORK5CYII=",
  "base64",
);
const actualFetch = globalThis.fetch;
let failNextReference = false;
let loseNextCreateResponse = false;
let denyProjectListing = false;
let duringDiagnosticUpload: (() => Promise<void>) | null = null;

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function page<T>(results: T[]) {
  return response({ results, next_page_results: false });
}

globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  const method = init?.method ?? "GET";
  calls.push({ method, path: url.pathname });
  if (url.hostname.endsWith("backblazeb2.com"))
    return new Response(png, { headers: { "content-type": "image/png" } });
  if (url.hostname === "plane-upload.example.invalid") {
    assert.equal(method, "POST");
    assert.ok(init?.body instanceof FormData);
    const asset = attachments.get(url.pathname.slice(1));
    assert.ok(asset);
    const file = init.body.get("file");
    assert.ok(file instanceof Blob);
    assert.equal(file.type, asset.type);
    asset.bytes = new Uint8Array(await file.arrayBuffer());
    if (asset.type === "text/markdown") {
      asset.text = await file.text();
      if (duringDiagnosticUpload) {
        const callback = duringDiagnosticUpload;
        duringDiagnosticUpload = null;
        await callback();
      }
    }
    return new Response(null, { status: 204 });
  }
  assert.equal(
    url.origin,
    "https://api.plane.so",
    "The harness must not contact external services.",
  );
  const path = url.pathname;
  const body = init?.body
    ? (JSON.parse(String(init.body)) as Record<string, unknown>)
    : {};
  if (path.endsWith("/project-members/"))
    return response([
      {
        id: genericUserId,
        email: "generic@example.invalid",
        role: 15,
        display_name: "Integration",
      },
      {
        id: reviewerUserId,
        email: "reviewer@example.invalid",
        role: 15,
        display_name: "Reviewer",
      },
    ]);
  if (path.endsWith("/intake-issues/")) {
    if (method === "GET")
      return page(
        [...remoteIssues.values()]
          .filter((issue) => issue.intakeId)
          .map((issue) => ({ id: issue.intakeId, issue })),
      );
    const sent = body.issue as Record<string, unknown>;
    const issue: RemoteIssue = {
      id: randomUUID(),
      intakeId: randomUUID(),
      sequence_id: remoteIssues.size + 1,
      project: remoteProjectId,
      state: "triage",
      description_html: String(sent.description_html),
    };
    remoteIssues.set(issue.id, issue);
    return response({ id: issue.intakeId, issue }, 201);
  }
  if (path.endsWith("/work-items/")) {
    if (method === "GET") {
      if (!url.searchParams.has("external_id")) {
        assert.equal(url.searchParams.get("per_page"), "1");
        assert.equal(url.searchParams.has("cursor"), false);
        if (denyProjectListing)
          return response({ error: "Project not found" }, 404);
        return response({
          results: [...remoteIssues.values()].slice(0, 1),
          next_page_results: true,
          next_cursor: "must-not-follow",
        });
      }
      const match = [...remoteIssues.values()].find(
        (issue) =>
          issue.external_id === url.searchParams.get("external_id") &&
          issue.external_source === url.searchParams.get("external_source"),
      );
      return match ? response(match) : response({ error: "Not found" }, 404);
    }
    const issue: RemoteIssue = {
      ...body,
      id: randomUUID(),
      sequence_id: remoteIssues.size + 1,
      project: remoteProjectId,
      state: String(body.state ?? initialState),
      description_html: String(body.description_html),
    };
    remoteIssues.set(issue.id, issue);
    if (loseNextCreateResponse) {
      loseNextCreateResponse = false;
      return response({ error: "Response lost after creation" }, 503);
    }
    return response(issue, 201);
  }
  const issueId = path.match(/\/work-items\/([^/]+)\//)?.[1];
  const issue = issueId ? remoteIssues.get(issueId) : undefined;
  assert.ok(issue, `Unknown mocked issue path ${path}`);
  if (path.endsWith(`/work-item-properties/${fieldId}/values/`)) {
    assert.equal(method, "POST");
    if (failNextReference) {
      failNextReference = false;
      return response({ error: "temporary fixture outage" }, 503);
    }
    references.set(issue.id, String(body.value));
    return response({ value: body.value });
  }
  if (path.endsWith("/attachments/")) {
    if (method === "GET")
      return page(
        [...attachments.values()].filter(
          (asset) => asset.issueId === issue.id && asset.is_uploaded,
        ),
      );
    const asset: RemoteAttachment = {
      id: randomUUID(),
      issueId: issue.id,
      external_id: String(body.external_id),
      external_source: String(body.external_source),
      type: String(body.type),
      name: String(body.name),
      is_uploaded: false,
    };
    attachments.set(asset.id, asset);
    return response({
      asset_id: asset.id,
      upload_data: {
        url: `https://plane-upload.example.invalid/${asset.id}`,
        fields: { key: asset.id, "Content-Type": asset.type },
      },
    });
  }
  const attachmentId = path.match(/\/attachments\/([^/]+)\//)?.[1];
  if (attachmentId) {
    const asset = attachments.get(attachmentId);
    assert.ok(asset?.bytes?.length, "Binary transfer must precede completion.");
    assert.equal(method, "PATCH");
    assert.equal(body.is_uploaded, true);
    asset.is_uploaded = true;
    return new Response(null, { status: 204 });
  }
  assert.ok(path.endsWith(`/work-items/${issue.id}/`));
  if (method === "PATCH") Object.assign(issue, body);
  return response(issue);
};

async function main() {
  const run = randomUUID();
  const organization = await prisma.organization.create({
    data: {
      name: `Export integration ${run}`,
      slug: `plane-export-test-${run}`,
    },
  });
  const installation = await prisma.planeInstallation.create({
    data: {
      organizationId: organization.id,
      appInstallationId: randomUUID(),
      workspaceId: randomUUID(),
      workspaceSlug: `export-test-${run}`,
      workspaceName: "Export integration fixture",
      botUserId: genericUserId,
      accessToken: encryptPlaneToken("mock-token"),
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const project = await prisma.project.create({
    data: {
      name: "Export integration fixture",
      domain: "example.invalid",
      publicId: `export-${run}`,
      apiKeyHash: "unused-fixture",
      apiKeyLastFour: "test",
      organizationId: organization.id,
    },
  });
  const reviewer = await prisma.reviewer.create({
    data: {
      projectId: project.id,
      name: "Export reviewer",
      token: `export-${run}`,
      email: " Reviewer@example.invalid ",
    },
  });
  const screenshot = await prisma.asset.create({
    data: {
      key: `export-integration/${run}.png`,
      bucket: "fixture",
      provider: "b2",
      filename: "screenshot.png",
      mimeType: "image/png",
      size: png.length,
    },
  });
  const config = await prisma.projectPlaneLink.create({
    data: {
      projectId: project.id,
      planeInstallationId: installation.id,
      planeProjectId: remoteProjectId,
      planeProjectName: "Mock Plane",
      planeProjectIdentifier: "MOCK",
      exportMode: "manual",
      genericAssigneeId: genericUserId,
      assignmentMode: "email",
      workItemTypeId: typeId,
      customFieldId: fieldId,
      defaultStateId: initialState,
      inProgressStateIds: [progressState],
      doneStateIds: [doneState],
    },
  });
  const newFeedback = (name: string, image = false) =>
    prisma.feedback.create({
      data: {
        projectId: project.id,
        reviewerId: reviewer.id,
        comment: `${name}: feedback to export`,
        pageUrl: "https://example.invalid/product",
        browserName: "Fixture browser",
        os: "Fixture OS",
        screenshotId: image ? screenshot.id : null,
        diagnosticTrail: {
          console: [
            {
              level: "error",
              message: "Fixture diagnostic",
              timestamp: Date.now(),
            },
          ],
          network: [],
        },
      },
    });

  const manual = await newFeedback("Manual", true);
  assert.equal(
    await queuePlaneExport(manual.id),
    null,
    "Manual mode must not enqueue automatic exports.",
  );
  await queuePlaneExport(manual.id, true);
  await processPlaneExport(manual.id);
  const manualLink = await prisma.feedbackPlaneIssueLink.findUniqueOrThrow({
    where: { feedbackId: manual.id },
  });
  assert.equal(references.get(manualLink.issueId), manual.id);
  assert.deepEqual(remoteIssues.get(manualLink.issueId)?.assignees, [
    reviewerUserId,
  ]);
  const uploaded = [...attachments.values()].filter(
    (asset) => asset.issueId === manualLink.issueId,
  );
  assert.equal(uploaded.length, 2);
  assert.ok(uploaded.every((asset) => asset.is_uploaded));
  assert.deepEqual(
    Buffer.from(uploaded.find((asset) => asset.type === "image/png")!.bytes!),
    png,
  );
  assert.match(
    uploaded.find((asset) => asset.type === "text/markdown")!.text!,
    /Fixture diagnostic/,
  );
  assert.equal(
    (
      await prisma.planeExport.findUniqueOrThrow({
        where: { feedbackId: manual.id },
      })
    ).status,
    "complete",
  );
  await queuePlaneExport(manual.id, true);
  await processPlaneExport(manual.id);
  assert.equal(
    remoteIssues.size,
    1,
    "Re-exporting completed feedback must not duplicate a Plane issue.",
  );
  assert.equal(attachments.size, 2);

  await prisma.projectPlaneLink.update({
    where: { id: config.id },
    data: { exportMode: "state", assignmentMode: "generic" },
  });
  const stateFeedback = await newFeedback("Selected state");
  await prisma.$transaction(async (tx) => {
    await queuePlaneExport(stateFeedback.id, false, tx);
  });
  failNextReference = true;
  await assert.rejects(() => processPlaneExport(stateFeedback.id), /HTTP 503/);
  assert.equal(remoteIssues.size, 2);
  await processPlaneExport(stateFeedback.id);
  assert.equal(
    remoteIssues.size,
    2,
    "A retry after a reference-write failure must reuse the persisted issue.",
  );
  const stateLink = await prisma.feedbackPlaneIssueLink.findUniqueOrThrow({
    where: { feedbackId: stateFeedback.id },
  });
  assert.equal(remoteIssues.get(stateLink.issueId)?.state, initialState);
  assert.deepEqual(remoteIssues.get(stateLink.issueId)?.assignees, [
    genericUserId,
  ]);

  await prisma.projectPlaneLink.update({
    where: { id: config.id },
    data: { exportMode: "intake", assignmentMode: "email" },
  });
  const intakeFeedback = await newFeedback("Intake");
  const intakeCallsStart = calls.length;
  await queuePlaneExport(intakeFeedback.id);
  await processPlaneExport(intakeFeedback.id);
  const intakeLink = await prisma.feedbackPlaneIssueLink.findUniqueOrThrow({
    where: { feedbackId: intakeFeedback.id },
  });
  const intakeIssue = remoteIssues.get(intakeLink.issueId)!;
  assert.ok(intakeLink.intakeId);
  assert.equal(intakeIssue.state, "triage");
  assert.equal(intakeIssue.external_id, intakeFeedback.id);
  assert.equal(intakeIssue.type_id, typeId);
  assert.deepEqual(intakeIssue.assignees, [reviewerUserId]);
  const intakeCalls = calls.slice(intakeCallsStart);
  const createIndex = intakeCalls.findIndex(
    (call) => call.method === "POST" && call.path.endsWith("/intake-issues/"),
  );
  const patchIndex = intakeCalls.findIndex(
    (call) =>
      call.method === "PATCH" &&
      call.path.endsWith(`/work-items/${intakeIssue.id}/`),
  );
  const propertyIndex = intakeCalls.findIndex((call) =>
    call.path.endsWith(`/work-item-properties/${fieldId}/values/`),
  );
  assert.ok(
    createIndex >= 0 && patchIndex > createIndex && propertyIndex > patchIndex,
    "Intake creation must precede field patching and custom reference.",
  );

  await prisma.projectPlaneLink.update({
    where: { id: config.id },
    data: { customFieldId: null },
  });
  const invalid = await newFeedback("Missing field");
  await queuePlaneExport(invalid.id, true);
  const countBeforeInvalid = remoteIssues.size;
  await assert.rejects(
    () => processPlaneExport(invalid.id),
    /custom text field/,
  );
  assert.equal(
    remoteIssues.size,
    countBeforeInvalid,
    "Missing configuration must fail before remote creation.",
  );
  await prisma.projectPlaneLink.update({
    where: { id: config.id },
    data: { customFieldId: fieldId },
  });

  for (const [state, expected] of [
    [progressState, "in_progress"],
    [doneState, "resolved"],
  ]) {
    remoteIssues.get(manualLink.issueId)!.state = state!;
    const eventId = randomUUID();
    await prisma.planeWebhookEvent.create({
      data: {
        id: eventId,
        workspaceId: installation.workspaceId,
        event: "workitem.updated",
        payload: {
          version: "v2",
          event_id: eventId,
          workspace_id: installation.workspaceId,
          event: "workitem.updated",
          entity_id: manualLink.issueId,
          data: { id: manualLink.issueId, project_id: remoteProjectId },
        },
      },
    });
    await processPlaneWebhook(eventId);
    assert.equal(
      (await prisma.feedback.findUniqueOrThrow({ where: { id: manual.id } }))
        .status,
      expected,
    );
    const afterFirstDelivery = calls.length;
    await processPlaneWebhook(eventId);
    assert.equal(
      calls.length,
      afterFirstDelivery,
      "Processed webhook replay must not repeat API work.",
    );
  }
  // The React widget attaches images after creating feedback, including after an export has finished.
  const attachLateScreenshot = (feedbackId: string) =>
    prisma.$transaction(async (tx) => {
      await tx.feedback.update({
        where: { id: feedbackId },
        data: { screenshotId: screenshot.id },
      });
      return resumePlaneScreenshotExport(feedbackId, tx);
    });
  const issueCountBeforeLateImage = remoteIssues.size;
  const diagnosticsCount = [...attachments.values()].filter(
    (asset) => asset.type === "text/markdown",
  ).length;
  assert.equal((await attachLateScreenshot(stateFeedback.id)).count, 1);
  assert.equal(
    (
      await prisma.planeExport.findUniqueOrThrow({
        where: { feedbackId: stateFeedback.id },
      })
    ).status,
    "pending",
  );
  await processPlaneExport(stateFeedback.id);
  const resumed = await prisma.planeExport.findUniqueOrThrow({
    where: { feedbackId: stateFeedback.id },
  });
  assert.equal(resumed.status, "complete");
  assert.equal(resumed.screenshotStatus, "complete");
  assert.equal(remoteIssues.size, issueCountBeforeLateImage);
  assert.equal(
    [...attachments.values()].filter((asset) => asset.type === "text/markdown")
      .length,
    diagnosticsCount,
  );
  assert.equal(
    [...attachments.values()].filter(
      (asset) =>
        asset.issueId === stateLink.issueId && asset.type === "image/png",
    ).length,
    1,
  );

  await prisma.projectPlaneLink.update({
    where: { id: config.id },
    data: { exportMode: "state" },
  });
  const inFlight = await newFeedback("Screenshot arrives during export");
  await queuePlaneExport(inFlight.id);
  duringDiagnosticUpload = async () => {
    await attachLateScreenshot(inFlight.id);
    await processPlaneExport(inFlight.id);
  };
  await processPlaneExport(inFlight.id);
  assert.equal(
    (
      await prisma.planeExport.findUniqueOrThrow({
        where: { feedbackId: inFlight.id },
      })
    ).status,
    "pending",
    "An active export must preserve a screenshot retry arriving during its final stage.",
  );
  const countAfterInFlight = remoteIssues.size;
  await processPlaneExport(inFlight.id);
  assert.equal(remoteIssues.size, countAfterInFlight);
  const inFlightJob = await prisma.planeExport.findUniqueOrThrow({
    where: { feedbackId: inFlight.id },
  });
  assert.equal(inFlightJob.status, "complete");
  assert.equal(inFlightJob.screenshotStatus, "complete");
  const inFlightLink = await prisma.feedbackPlaneIssueLink.findUniqueOrThrow({
    where: { feedbackId: inFlight.id },
  });
  assert.equal(
    [...attachments.values()].filter(
      (asset) => asset.issueId === inFlightLink.issueId,
    ).length,
    2,
    "Resuming must not duplicate diagnostics or the image.",
  );

  await prisma.projectPlaneLink.update({
    where: { id: config.id },
    data: { exportMode: "manual" },
  });
  const untouchedManual = await newFeedback("Unexported manual feedback");
  assert.equal(await queuePlaneExport(untouchedManual.id), null);
  assert.equal((await attachLateScreenshot(untouchedManual.id)).count, 0);
  assert.equal(
    await prisma.planeExport.findUnique({
      where: { feedbackId: untouchedManual.id },
    }),
    null,
    "Attaching a screenshot must not start a manual export.",
  );

  const uncertain = await newFeedback("Created remotely, response lost");
  await queuePlaneExport(uncertain.id, true);
  const beforeUncertain = remoteIssues.size;
  loseNextCreateResponse = true;
  await assert.rejects(() => processPlaneExport(uncertain.id), /HTTP 503/);
  assert.equal(remoteIssues.size, beforeUncertain + 1);
  assert.equal(
    await prisma.feedbackPlaneIssueLink.findUnique({
      where: { feedbackId: uncertain.id },
    }),
    null,
  );
  await processPlaneExport(uncertain.id);
  assert.equal(
    remoteIssues.size,
    beforeUncertain + 1,
    "An exact external-ID lookup returns one object and must recover the existing issue.",
  );
  assert.equal(
    (
      await prisma.planeExport.findUniqueOrThrow({
        where: { feedbackId: uncertain.id },
      })
    ).status,
    "complete",
  );

  const inaccessible = await newFeedback("Project is inaccessible");
  await queuePlaneExport(inaccessible.id, true);
  const callsBeforeInaccessible = calls.length;
  const issuesBeforeInaccessible = remoteIssues.size;
  denyProjectListing = true;
  await assert.rejects(() => processPlaneExport(inaccessible.id), /HTTP 404/);
  denyProjectListing = false;
  assert.equal(remoteIssues.size, issuesBeforeInaccessible);
  assert.equal(calls.length - callsBeforeInaccessible, 2);
  assert.equal(
    (
      await prisma.planeExport.findUniqueOrThrow({
        where: { feedbackId: inaccessible.id },
      })
    ).createAttemptedAt,
    null,
  );

  console.log(
    JSON.stringify({
      evidence:
        "real isolated PostgreSQL + mocked Plane and object-storage transports",
      passed: [
        "manual gating",
        "selected state",
        "Intake create/patch ordering",
        "email and generic assignment",
        "custom field references",
        "image and Markdown multipart uploads",
        "partial and complete export retry deduplication",
        "external lookup 404 and singleton recovery after an uncertain creation",
        "constant-size project access validation; inaccessible project fails before creation",
        "missing-field preflight",
        "durable webhook status processing and deduplication",
        "late screenshots resume complete/in-flight exports without duplicate issues or diagnostics; manual mode preserved",
      ],
      issueCount: remoteIssues.size,
      attachmentCount: attachments.size,
      fixtureOrganizationId: organization.id,
    }),
  );
}

main().finally(async () => {
  globalThis.fetch = actualFetch;
  await prisma.$disconnect();
});
