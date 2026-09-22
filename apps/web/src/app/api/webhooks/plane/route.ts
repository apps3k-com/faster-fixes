import { prisma } from "@workspace/db";
import type { Prisma } from "@workspace/db/generated/prisma/client";
import { inngest } from "@/server/inngest";
import { isPlaneEnabled } from "@/server/plane/client";
import { verifyPlaneWebhook } from "@/server/plane/verify-webhook";
import { normalizePlaneWebhook } from "@/server/plane/normalize-webhook";

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
  const normalized = normalizePlaneWebhook(raw);
  if (normalized.status === "invalid")
    return new Response(null, { status: 400 });
  if (normalized.status === "ignored")
    return new Response(null, { status: 202 });
  const payload = normalized.payload;
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
