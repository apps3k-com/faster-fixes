-- CreateEnum
CREATE TYPE "DiscussionCommentOrigin" AS ENUM ('FF', 'PLANE');

-- AlterTable
ALTER TABLE "reviewer" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "plane_installation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appInstallationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "workspaceName" TEXT NOT NULL,
    "botUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "healthState" TEXT NOT NULL DEFAULT 'connected',
    "installedById" TEXT,

    CONSTRAINT "plane_installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plane_oauth_state" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plane_oauth_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_plane_link" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "planeInstallationId" TEXT NOT NULL,
    "planeProjectId" TEXT NOT NULL,
    "planeProjectName" TEXT NOT NULL,
    "planeProjectIdentifier" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "exportMode" TEXT NOT NULL DEFAULT 'manual',
    "defaultStateId" TEXT,
    "workItemTypeId" TEXT,
    "customFieldId" TEXT,
    "assignmentMode" TEXT NOT NULL DEFAULT 'generic',
    "genericAssigneeId" TEXT NOT NULL,
    "inProgressStateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "doneStateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "commentsEnabledAt" TIMESTAMP(3),
    "linkHealthIssue" TEXT,

    CONSTRAINT "project_plane_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_plane_issue_link" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "projectPlaneLinkId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "intakeId" TEXT,
    "issueIdentifier" TEXT NOT NULL,
    "issueUrl" TEXT NOT NULL,
    "issueStateId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncSource" TEXT,
    "commentSyncLockedUntil" TIMESTAMP(3),

    CONSTRAINT "feedback_plane_issue_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plane_export" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "projectPlaneLinkId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createAttemptedAt" TIMESTAMP(3),
    "referenceWritten" BOOLEAN NOT NULL DEFAULT false,
    "screenshotAttachmentId" TEXT,
    "screenshotStatus" TEXT NOT NULL DEFAULT 'pending',
    "diagnosticsAttachmentId" TEXT,
    "diagnosticsStatus" TEXT NOT NULL DEFAULT 'pending',
    "assignmentNote" TEXT,
    "lastError" TEXT,

    CONSTRAINT "plane_export_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plane_webhook_event" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "plane_webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_discussion_comment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "origin" "DiscussionCommentOrigin" NOT NULL DEFAULT 'FF',
    "remoteCommentId" TEXT,
    "remoteUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "syncError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "feedback_discussion_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plane_installation_organizationId_key" ON "plane_installation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "plane_installation_appInstallationId_key" ON "plane_installation"("appInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "plane_installation_workspaceId_key" ON "plane_installation"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "project_plane_link_projectId_key" ON "project_plane_link"("projectId");

-- CreateIndex
CREATE INDEX "project_plane_link_planeInstallationId_planeProjectId_idx" ON "project_plane_link"("planeInstallationId", "planeProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_plane_issue_link_feedbackId_key" ON "feedback_plane_issue_link"("feedbackId");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_plane_issue_link_projectPlaneLinkId_issueId_key" ON "feedback_plane_issue_link"("projectPlaneLinkId", "issueId");

-- CreateIndex
CREATE UNIQUE INDEX "plane_export_feedbackId_key" ON "plane_export"("feedbackId");

-- CreateIndex
CREATE INDEX "plane_export_status_nextAttemptAt_idx" ON "plane_export"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "plane_webhook_event_processedAt_createdAt_idx" ON "plane_webhook_event"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_discussion_comment_feedbackId_createdAt_idx" ON "feedback_discussion_comment"("feedbackId", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_discussion_comment_syncStatus_idx" ON "feedback_discussion_comment"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_discussion_comment_feedbackId_remoteCommentId_key" ON "feedback_discussion_comment"("feedbackId", "remoteCommentId");

-- AddForeignKey
ALTER TABLE "plane_installation" ADD CONSTRAINT "plane_installation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plane_installation" ADD CONSTRAINT "plane_installation_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_plane_link" ADD CONSTRAINT "project_plane_link_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_plane_link" ADD CONSTRAINT "project_plane_link_planeInstallationId_fkey" FOREIGN KEY ("planeInstallationId") REFERENCES "plane_installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_plane_issue_link" ADD CONSTRAINT "feedback_plane_issue_link_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_plane_issue_link" ADD CONSTRAINT "feedback_plane_issue_link_projectPlaneLinkId_fkey" FOREIGN KEY ("projectPlaneLinkId") REFERENCES "project_plane_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plane_export" ADD CONSTRAINT "plane_export_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plane_export" ADD CONSTRAINT "plane_export_projectPlaneLinkId_fkey" FOREIGN KEY ("projectPlaneLinkId") REFERENCES "project_plane_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_discussion_comment" ADD CONSTRAINT "feedback_discussion_comment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
