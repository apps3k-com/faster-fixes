"use client";

import { useTRPC } from "@/lib/trpc/trpc-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { toast } from "sonner";
import * as React from "react";

type Project = { id: string; name: string; identifier: string };

export function PlaneProjectPicker({
  projectId,
  projects,
}: {
  projectId: string;
  projects: Project[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [planeProjectId, setPlaneProjectId] = React.useState("");
  const catalog = useQuery(
    trpc.authenticated.projects.plane.listCatalog.queryOptions(
      { projectId, planeProjectId },
      { enabled: !!planeProjectId },
    ),
  );
  const [assigneeId, setAssigneeId] = React.useState("");
  const link = useMutation(
    trpc.authenticated.projects.plane.linkProject.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.authenticated.projects.plane.getLink.queryKey({
            projectId,
          }),
        });
        toast.success("Plane project linked.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  React.useEffect(() => {
    const eligible = catalog.data?.members.find(
      (member) => member.role === null || member.role >= 15,
    );
    if (!assigneeId && eligible) setAssigneeId(eligible.id);
  }, [assigneeId, catalog.data?.members]);

  const selectedProject = projects.find(
    (project) => project.id === planeProjectId,
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="plane-project">Plane project</Label>
        <Select value={planeProjectId} onValueChange={setPlaneProjectId}>
          <SelectTrigger id="plane-project">
            <SelectValue placeholder="Select a Plane project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.identifier} · {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedProject && catalog.data ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plane-assignee">Generic Plane assignee</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger id="plane-assignee">
                <SelectValue placeholder="Select a project member" />
              </SelectTrigger>
              <SelectContent>
                {catalog.data.members
                  .filter((member) => member.role === null || member.role >= 15)
                  .map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name || member.email || member.id}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Used when reviewer email matching is disabled or has no match.
            </p>
          </div>
          <Button
            disabled={link.isPending || !assigneeId}
            onClick={() =>
              link.mutate({
                projectId,
                planeProjectId,
                genericAssigneeId: assigneeId,
                exportMode: "manual",
                assignmentMode: "generic",
                inProgressStateIds: [],
                doneStateIds: [],
                commentsEnabled: false,
              })
            }
          >
            {link.isPending ? "Linking..." : "Link Plane project"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
