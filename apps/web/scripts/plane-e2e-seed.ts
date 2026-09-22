import { createRequire } from "node:module";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
const { prisma } = createRequire(import.meta.url)(
  "@workspace/db",
) as typeof import("@workspace/db");

// This fixture must never target the deployed instance or a shared database.
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/ff_plane_e2e"
) {
  throw new Error("Use a dedicated local ff_plane_e2e database.");
}

async function main() {
  const email = "plane-e2e@example.invalid";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      id: randomUUID(),
      email,
      name: "Plane E2E Admin",
      emailVerified: true,
      role: "admin",
      onboardingCompleted: true,
    },
  });
  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (!account)
    await prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: user.id,
        userId: user.id,
        providerId: "credential",
        password: await hashPassword("Local-Plane-E2E-Only-2026"),
      },
    });
  const organization = await prisma.organization.upsert({
    where: { slug: "plane-e2e" },
    update: {},
    create: {
      name: "Plane E2E",
      slug: "plane-e2e",
      isDefault: true,
      members: { create: { userId: user.id, role: "owner" } },
    },
  });
  const project = await prisma.project.upsert({
    where: { publicId: "proj_planee2e00000000000000000" },
    update: {},
    create: {
      name: "Plane E2E website",
      domain: "localhost",
      publicId: "proj_planee2e00000000000000000",
      apiKeyHash: "local-e2e",
      apiKeyLastFour: "e2e",
      organizationId: organization.id,
    },
  });
  const reviewer = await prisma.reviewer.upsert({
    where: { token: "local-plane-e2e-reviewer" },
    update: {},
    create: {
      projectId: project.id,
      name: "E2E Reviewer",
      token: "local-plane-e2e-reviewer",
      email: "reviewer@example.invalid",
    },
  });
  const feedback = await prisma.feedback.create({
    data: {
      projectId: project.id,
      reviewerId: reviewer.id,
      comment: "Plane integration E2E feedback",
      pageUrl: "http://localhost:3100/test-page",
      diagnosticTrail: {
        console: [
          {
            level: "error",
            message: "E2E diagnostic sample",
            timestamp: Date.now(),
          },
        ],
        network: [],
      },
    },
  });
  console.log(
    JSON.stringify({
      organizationId: organization.id,
      projectId: project.id,
      feedbackId: feedback.id,
    }),
  );
}

main().finally(() => prisma.$disconnect());
