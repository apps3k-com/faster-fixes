"use client";

import { useActiveOrganization } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc/trpc-client";
import { matchQueryStatus } from "@/utils/tanstack-query/match-query-status";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { PlaneConnected } from "./plane-connected.client";
import { PlaneNotConnected } from "./plane-not-connected.client";
import { useSearchParams } from "next/navigation";

const authorizationErrors: Record<string, string> = {
  plane_disabled:
    "Plane integration is disabled. Ask your instance administrator to enable it.",
  plane_invalid_state:
    "This authorization attempt expired or could not be verified. Start the connection again.",
  plane_insufficient_role: "An organization owner or admin must connect Plane.",
  plane_oauth_not_configured:
    "Plane client credentials are missing. Ask your instance administrator to configure them and try again.",
  plane_token_exchange_failed:
    "Faster Fixes could not reach Plane to obtain an access token. Check server connectivity and try again.",
  plane_token_response_json:
    "Plane returned an unreadable token response. Ask your instance administrator to check the Plane OAuth service.",
  plane_token_response_access_token:
    "Plane did not return a valid access token. Check the Plane app configuration and try again.",
  plane_token_response_expires_in:
    "Plane did not return a valid token lifetime. Ask your instance administrator to check OAuth compatibility; no connection was saved.",
  plane_installation_lookup_failed:
    "The token was obtained, but Faster Fixes could not retrieve the Plane installation. Check server connectivity and try again.",
  plane_installation_lookup_invalid_response:
    "Plane returned unexpected installation details. Ask your instance administrator to check OAuth compatibility; no connection was saved.",
  plane_installation_unavailable:
    "The authorized Plane installation is not available or is no longer installed. Reinstall the Plane app and connect again.",
  plane_encryption_configuration:
    "The Plane token could not be encrypted. Ask your instance administrator to check the 64-character hexadecimal token encryption key.",
  plane_persistence_failed:
    "Plane authorization succeeded, but Faster Fixes could not save the connection. Ask your instance administrator to check database availability and migrations.",
  plane_persistence_conflict:
    "This Plane workspace or app installation is already connected to another Faster Fixes organization. Use that organization or another Plane workspace.",
  plane_workspace_change_blocked:
    "Existing project links belong to another Plane workspace. Reconnect that workspace to preserve their issue links.",
};

function authorizationErrorMessage(code: string) {
  const message = authorizationErrors[code];
  if (message) return message;
  const httpError =
    /^plane_(token_exchange|installation_lookup)_http_([45]\d{2})$/.exec(code);
  if (httpError) {
    const status = Number(httpError[2]);
    const step =
      httpError[1] === "token_exchange"
        ? "token exchange"
        : "installation lookup";
    const nextStep =
      status === 429
        ? "Wait briefly and start the connection again."
        : status >= 500
          ? "Plane reported a server error. Start the connection again shortly."
          : "Ask your instance administrator to check the Plane app credentials, scopes and installation permissions.";
    return `Plane rejected the ${step} (HTTP ${status}). ${nextStep}`;
  }
  return "Plane authorization could not be completed. Start the connection again or contact your instance administrator.";
}

export function PlaneIntegrationSection() {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const { data: activeOrg } = useActiveOrganization();
  const installation = useQuery(
    trpc.authenticated.integrations.plane.getInstallation.queryOptions(
      undefined,
      { enabled: !!activeOrg?.id },
    ),
  );

  const callbackError = searchParams.get("error");
  const callbackSuccess = searchParams.get("plane") === "connected";
  return (
    <div className="flex flex-col gap-3">
      {callbackError?.startsWith("plane_") ? (
        <Alert variant="destructive">
          <AlertDescription>
            {authorizationErrorMessage(callbackError)}
          </AlertDescription>
        </Alert>
      ) : null}
      {callbackSuccess ? (
        <Alert>
          <AlertDescription>Plane workspace connected.</AlertDescription>
        </Alert>
      ) : null}
      {matchQueryStatus(installation, {
        Loading: <Skeleton className="h-16 w-full" />,
        Errored: (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load the Plane integration. Try refreshing the page.
            </AlertDescription>
          </Alert>
        ),
        Empty: <PlaneNotConnected />,
        Success: ({ data }) =>
          data.installation ? (
            <PlaneConnected installation={data.installation} />
          ) : (
            <PlaneNotConnected enabled={data.enabled} />
          ),
      })}
    </div>
  );
}
