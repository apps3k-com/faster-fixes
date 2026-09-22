import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyPlaneWebhook(
  body: string,
  signature: string | null,
  secret: string | undefined,
): boolean {
  if (!signature || !secret) return false;
  const hex = signature.replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/i.test(hex)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(hex, "hex"));
}
