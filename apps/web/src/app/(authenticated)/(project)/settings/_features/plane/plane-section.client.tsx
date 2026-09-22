"use client";

import { useActiveOrganization } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc/trpc-client";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { PlaneProjectPicker } from "./plane-project-picker.client";
import { LinkedPlaneProjectView } from "./linked-plane-project-view.client";

export function PlaneSection({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const { data: activeOrg } = useActiveOrganization();
  const installationQuery = useQuery(
    trpc.authenticated.integrations.plane.getInstallation.queryOptions(
      undefined,
      { enabled: !!activeOrg?.id },
    ),
  );
  const linkQuery = useQuery(
    trpc.authenticated.projects.plane.getLink.queryOptions({ projectId }),
  );
  const projectsQuery = useQuery(
    trpc.authenticated.projects.plane.listProjects.queryOptions(undefined, {
      enabled: !!installationQuery.data && !linkQuery.data,
    }),
  );

  if (installationQuery.isPending || linkQuery.isPending)
    return <Skeleton className="h-32 w-full" />;
  if (installationQuery.isError || linkQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load Plane project settings. Try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }
  if (
    !installationQuery.data?.installation ||
    installationQuery.data.installation.healthState !== "connected"
  ) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          Connect Plane in organization settings before linking a project.
        </p>
        <Button variant="link" className="w-fit px-0" asChild>
          <a href="/integrations">Go to integrations</a>
        </Button>
      </div>
    );
  }
  return linkQuery.data ? (
    <LinkedPlaneProjectView projectId={projectId} link={linkQuery.data} />
  ) : (
    <PlaneProjectPicker
      projectId={projectId}
      projects={projectsQuery.data ?? []}
    />
  );
}
