import { inngest } from "@/server/inngest";
import { addContactToSegment } from "@/server/inngest/add-contact-to-segment";
import { createGitHubIssue } from "@/server/inngest/create-github-issue";
import { createJiraIssue } from "@/server/inngest/create-jira-issue";
import { createLinearIssue } from "@/server/inngest/create-linear-issue";
import { handleJiraOAuthRevoked } from "@/server/inngest/handle-jira-oauth-revoked";
import { handleLinearOAuthRevoked } from "@/server/inngest/handle-linear-oauth-revoked";
import { notifySlackFeedbackCreated } from "@/server/inngest/notify-slack-feedback-created";
import { refreshJiraInstallationWebhooks } from "@/server/inngest/refresh-jira-installation-webhooks";
import { refreshJiraWebhooks } from "@/server/inngest/refresh-jira-webhooks";
import { sendWelcomeEmail } from "@/server/inngest/send-welcome-email";
import { syncFeedbackStatusToGitHub } from "@/server/inngest/sync-feedback-status-to-github";
import { syncFeedbackStatusToJira } from "@/server/inngest/sync-feedback-status-to-jira";
import { syncFeedbackStatusToLinear } from "@/server/inngest/sync-feedback-status-to-linear";
import { syncGitHubIssueStatus } from "@/server/inngest/sync-github-issue-status";
import { syncJiraIssueStatus } from "@/server/inngest/sync-jira-issue-status";
import { syncLinearIssueStatus } from "@/server/inngest/sync-linear-issue-status";
import { updateSlackFeedbackMessage } from "@/server/inngest/update-slack-feedback-message";
import { serve } from "inngest/next";
import {
  syncPlaneDiscussion,
  reconcilePlaneDiscussions,
} from "@/server/inngest/sync-plane-discussions";
import {
  exportPlaneFeedback,
  receivePlaneWebhook,
  sweepPlaneSync,
} from "@/server/inngest/sync-plane";

// Required by v4 checkpointing: client maxRuntime ("50s") must sit below this.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    syncPlaneDiscussion,
    reconcilePlaneDiscussions,
    exportPlaneFeedback,
    receivePlaneWebhook,
    sweepPlaneSync,
    createGitHubIssue,
    syncGitHubIssueStatus,
    syncFeedbackStatusToGitHub,
    createLinearIssue,
    syncLinearIssueStatus,
    syncFeedbackStatusToLinear,
    handleLinearOAuthRevoked,
    createJiraIssue,
    syncJiraIssueStatus,
    syncFeedbackStatusToJira,
    handleJiraOAuthRevoked,
    refreshJiraWebhooks,
    refreshJiraInstallationWebhooks,
    sendWelcomeEmail,
    addContactToSegment,
    notifySlackFeedbackCreated,
    updateSlackFeedbackMessage,
  ],
});
