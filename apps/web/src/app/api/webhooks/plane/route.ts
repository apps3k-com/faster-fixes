import { prisma } from "@workspace/db";
import type { Prisma } from "@workspace/db/generated/prisma/client";
import { inngest } from "@/server/inngest";
import { isPlaneEnabled } from "@/server/plane/client";
import { verifyPlaneWebhook } from "@/server/plane/verify-webhook";

export async function POST(request: Request) {
  if (!isPlaneEnabled()) return new Response(null, { status: 404 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return new Response(null, { status: 413 });
  if (
    !verifyPlaneWebhook(
      raw,
      request.headers.get("x-plane-signature"),
      process.env.PLANE_WEBHOOK_SECRET,
    )
  )
    return new Response(null, { status: 401 });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (
    payload.version !== "v2" ||
    typeof payload.event_id !== "string" ||
    typeof payload.workspace_id !== "string" ||
    typeof payload.event !== "string"
  )
    return new Response(null, { status: 400 });
  const installation = await prisma.planeInstallation.findUnique({
    where: { workspaceId: payload.workspace_id },
  });
  if (!installation || installation.healthState !== "connected")
    return new Response(null, { status: 202 });
  await prisma.planeWebhookEvent.upsert({
    where: { id: payload.event_id },
    create: {
      id: payload.event_id,
      workspaceId: payload.workspace_id,
      event: payload.event,
      payload: payload as Prisma.InputJsonObject,
    },
    update: {},
  });
  // The durable inbox is committed before acknowledgement; the sweep covers dispatch outages.
  await inngest
    .send({
      name: "plane/webhook.received",
      data: { eventId: payload.event_id },
    })
    .catch(() => undefined);
  return new Response(null, { status: 202 });
}
