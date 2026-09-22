import { router } from "@/server/trpc/trpc";
import { createAgentToken } from "../_features/agent-tokens/create-agent-token.trpc.mutation";
import { deleteAgentToken } from "../_features/agent-tokens/delete-agent-token.trpc.mutation";
import { getAgentTokens } from "../_features/agent-tokens/get-agent-tokens.trpc.query";
import { revokeAgentToken } from "../_features/agent-tokens/revoke-agent-token.trpc.mutation";
import { disconnectGitHub } from "../_features/github/disconnect-github.trpc.mutation";
import { getGitHubInstallation } from "../_features/github/get-github-installation.trpc.query";
import { disconnectJira } from "../_features/jira/disconnect-jira.trpc.mutation";
import { getJiraInstallation } from "../_features/jira/get-jira-installation.trpc.query";
import { listAccessibleJiraSites } from "../_features/jira/list-accessible-sites.trpc.query";
import { selectJiraSite } from "../_features/jira/select-jira-site.trpc.mutation";
import { disconnectLinear } from "../_features/linear/disconnect-linear.trpc.mutation";
import { getLinearInstallation } from "../_features/linear/get-linear-installation.trpc.query";
import { disconnectSlack } from "../_features/slack/disconnect-slack.trpc.mutation";
import { getSlackInstallation } from "../_features/slack/get-slack-installation.trpc.query";
import { disconnectPlane } from "../_features/plane/disconnect-plane.trpc.mutation";
import { getPlaneInstallation } from "../_features/plane/get-plane-installation.trpc.query";
import { getPlaneMembers } from "../_features/plane/get-plane-members.trpc.query";
import { invitePlaneMember } from "../_features/plane/invite-plane-member.trpc.mutation";

export const integrationsRouter = router({
  agentToken: router({
    list: getAgentTokens,
    create: createAgentToken,
    revoke: revokeAgentToken,
    delete: deleteAgentToken,
  }),
  github: router({
    getInstallation: getGitHubInstallation,
    disconnect: disconnectGitHub,
  }),
  linear: router({
    getInstallation: getLinearInstallation,
    disconnect: disconnectLinear,
  }),
  jira: router({
    getInstallation: getJiraInstallation,
    listAccessibleSites: listAccessibleJiraSites,
    selectSite: selectJiraSite,
    disconnect: disconnectJira,
  }),
  slack: router({
    getInstallation: getSlackInstallation,
    disconnect: disconnectSlack,
  }),
  plane: router({
    getInstallation: getPlaneInstallation,
    listMembers: getPlaneMembers,
    inviteMember: invitePlaneMember,
    disconnect: disconnectPlane,
  }),
});
