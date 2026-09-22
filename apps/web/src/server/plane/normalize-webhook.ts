import { createHash } from "node:crypto";

const supportedEvents = new Set([
  "workitem.created",
  "workitem.updated",
  "workitem.deleted",
  "workitem.comment.created",
  "workitem.comment.updated",
  "workitem.comment.deleted",
]);
type Envelope = Record<string, unknown> & {
  event_id: string;
  workspace_id: string;
  event: string;
};
type NormalizedWebhook =
  | { status: "accepted"; payload: Envelope }
  | { status: "invalid" }
  | { status: "ignored" };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function identifier(value: unknown): string | undefined {
  const id = typeof value === "string" ? value : record(value)?.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

// Call only after verifying the raw body's signature. Delivery headers are not signed or stable across retries.
export function normalizePlaneWebhook(raw: string): NormalizedWebhook {
  let payload: Record<string, unknown> | null;
  try {
    payload = record(JSON.parse(raw));
  } catch {
    return { status: "invalid" };
  }
  if (
    !payload ||
    typeof payload.workspace_id !== "string" ||
    !payload.workspace_id ||
    typeof payload.event !== "string"
  )
    return { status: "invalid" };
  if (payload.version === "v2") {
    if (typeof payload.event_id !== "string" || !payload.event_id)
      return { status: "invalid" };
    return supportedEvents.has(payload.event)
      ? { status: "accepted", payload: payload as Envelope }
      : { status: "ignored" };
  }
  if (payload.version !== undefined && payload.version !== "v1")
    return { status: "invalid" };
  if (!["issue", "issue_comment"].includes(payload.event))
    return { status: "ignored" };
  const actions: Record<string, string> = {
    create: "created",
    created: "created",
    update: "updated",
    updated: "updated",
    delete: "deleted",
    deleted: "deleted",
  };
  const action =
    typeof payload.action === "string" && Object.hasOwn(actions, payload.action)
      ? actions[payload.action]
      : undefined;
  const data = record(payload.data);
  const entityId = identifier(data?.id);
  if (!action || !data || !entityId || !identifier(payload.webhook_id))
    return { status: "invalid" };
  const projectId = identifier(data.project_id ?? data.project);
  const issueId = identifier(data.issue_id ?? data.issue ?? data.work_item);
  return {
    status: "accepted",
    payload: {
      ...payload,
      version: "v2",
      source_version: "v1",
      event_id: `legacy:${createHash("sha256").update(raw).digest("hex")}`,
      workspace_id: payload.workspace_id,
      event: `${payload.event === "issue" ? "workitem" : "workitem.comment"}.${action}`,
      entity_type: payload.event,
      entity_id: entityId,
      data: {
        ...data,
        ...(projectId ? { project_id: projectId } : {}),
        ...(issueId ? { issue_id: issueId } : {}),
      },
      previous_attributes: {},
    },
  };
}
