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
            Plane authorization failed:{" "}
            {callbackError.replace(/^plane_/, "").replaceAll("_", " ")}.
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
