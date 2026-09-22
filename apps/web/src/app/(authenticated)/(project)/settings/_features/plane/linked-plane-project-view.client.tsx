"use client";

import { useTRPC } from "@/lib/trpc/trpc-client";
import { matchQueryStatus } from "@/utils/tanstack-query/match-query-status";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import * as React from "react";
import type { GetProjectPlaneLinkOutput } from "./get-project-plane-link.trpc.query";

type Link = NonNullable<GetProjectPlaneLinkOutput>;
type ExportMode = "manual" | "intake" | "state";
type AssignmentMode = "generic" | "email";
type LinkedPlaneProjectViewProps = { projectId: string; link: Link };
const NO_MAPPING = "__none__";

export function LinkedPlaneProjectView({
  projectId,
  link,
}: LinkedPlaneProjectViewProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [exportMode, setExportMode] = React.useState<ExportMode>(
    link.exportMode as ExportMode,
  );
  const [assignmentMode, setAssignmentMode] = React.useState<AssignmentMode>(
    link.assignmentMode as AssignmentMode,
  );
  const [commentsEnabled, setCommentsEnabled] = React.useState(
    link.commentsEnabled,
  );
  const [typeId, setTypeId] = React.useState(link.workItemTypeId ?? "");
  const [fieldId, setFieldId] = React.useState(link.customFieldId ?? "");
  const [genericAssigneeId, setGenericAssigneeId] = React.useState(
    link.genericAssigneeId,
  );
  const [defaultStateId, setDefaultStateId] = React.useState(
    link.defaultStateId ?? "",
  );
  const [inProgressStateId, setInProgressStateId] = React.useState(
    link.inProgressStateIds[0] ?? "",
  );
  const [doneStateId, setDoneStateId] = React.useState(
    link.doneStateIds[0] ?? "",
  );
  const catalog = useQuery(
    trpc.authenticated.projects.plane.listCatalog.queryOptions({
      projectId,
      planeProjectId: link.planeProjectId,
      typeId: typeId || undefined,
    }),
  );
  const invalidateLink = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.authenticated.projects.plane.getLink.queryKey({
        projectId,
      }),
    });
  const update = useMutation(
    trpc.authenticated.projects.plane.updateLink.mutationOptions({
      onSuccess: async () => {
        await invalidateLink();
        toast.success("Plane settings updated.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const unlink = useMutation(
    trpc.authenticated.projects.plane.unlinkProject.mutationOptions({
      onSuccess: async () => {
        await invalidateLink();
        toast.success("Plane project unlinked.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const save = (enabled: boolean) =>
    update.mutate({
      projectId,
      enabled,
      exportMode,
      defaultStateId: defaultStateId || null,
      assignmentMode,
      commentsEnabled,
      workItemTypeId: typeId || null,
      customFieldId: fieldId || null,
      genericAssigneeId,
      inProgressStateIds: inProgressStateId ? [inProgressStateId] : [],
      doneStateIds: doneStateId ? [doneStateId] : [],
    });
  const busy = update.isPending || unlink.isPending;

  return (
    <div className="flex flex-col gap-4">
      {link.linkHealthIssue && (
        <Alert variant="destructive">
          <AlertDescription>
            Plane settings need attention: {link.linkHealthIssue}.
          </AlertDescription>
        </Alert>
      )}
      {!link.enabled && (
        <Alert>
          <AlertDescription>
            Synchronization is paused. Choose a work item type, an FF Issue ID
            text field, and a generic assignee before enabling it.
          </AlertDescription>
        </Alert>
      )}
      <a
        href={`https://app.plane.so/${encodeURIComponent(link.workspaceSlug)}/projects/${encodeURIComponent(link.planeProjectId)}/issues`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium hover:underline"
      >
        {link.planeProjectIdentifier} · {link.planeProjectName}
        <ExternalLink className="ml-1 inline size-3" />
      </a>
      {matchQueryStatus(catalog, {
        Loading: (
          <p className="text-muted-foreground text-sm">
            Loading Plane project settings...
          </p>
        ),
        Errored: (
          <Alert variant="destructive">
            <AlertDescription>
              Could not load Plane settings. Check the connection and project
              access in{" "}
              <a href="/integrations" className="underline">
                Integrations
              </a>
              , then retry.
            </AlertDescription>
          </Alert>
        ),
        Empty: (
          <p className="text-muted-foreground text-sm">
            No Plane project settings are available. Check project access in
            Integrations.
          </p>
        ),
        Success: ({ data }) => {
          const textFields = data.fields.filter(
            (field) =>
              field.property_type.toUpperCase() === "TEXT" &&
              field.display_format !== "readonly",
          );
          return (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="plane-export-mode">Feedback export</Label>
                <Select
                  value={exportMode}
                  onValueChange={(value) => setExportMode(value as ExportMode)}
                >
                  <SelectTrigger id="plane-export-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual transfer</SelectItem>
                    <SelectItem value="intake">Create in Intake</SelectItem>
                    <SelectItem value="state">
                      Create with selected state
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="plane-work-item-type">
                  Plane work item type
                </Label>
                <Select
                  value={typeId}
                  onValueChange={(value) => {
                    setTypeId(value);
                    setFieldId("");
                  }}
                >
                  <SelectTrigger id="plane-work-item-type">
                    <SelectValue placeholder="Select a work item type" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {data.types.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Create a work item type in Plane, then reload these settings.
                </p>
              )}
              {exportMode === "state" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="plane-default-state">
                    Initial Plane state
                  </Label>
                  <Select
                    value={defaultStateId}
                    onValueChange={setDefaultStateId}
                  >
                    <SelectTrigger id="plane-default-state">
                      <SelectValue placeholder="Select a state" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.states.map((state) => (
                        <SelectItem key={state.id} value={state.id}>
                          {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="plane-id-field">FF Issue ID custom field</Label>
                <Select
                  value={fieldId}
                  onValueChange={setFieldId}
                  disabled={!textFields.length}
                >
                  <SelectTrigger id="plane-id-field">
                    <SelectValue placeholder="Select a text field" />
                  </SelectTrigger>
                  <SelectContent>
                    {textFields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.display_name ?? field.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!typeId ? (
                  <p className="text-muted-foreground text-xs">
                    Select a work item type to load its fields.
                  </p>
                ) : textFields.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Create an active text custom field on this work item type in
                    Plane, then reload these settings.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Required. Faster Fixes writes its permanent feedback ID to
                    this field.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="plane-assignment-mode">Issue assignee</Label>
                <Select
                  value={assignmentMode}
                  onValueChange={(value) =>
                    setAssignmentMode(value as AssignmentMode)
                  }
                >
                  <SelectTrigger id="plane-assignment-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generic">Generic Plane user</SelectItem>
                    <SelectItem value="email">Match reviewer email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="plane-generic-assignee">
                  Generic Plane user
                </Label>
                <Select
                  value={genericAssigneeId}
                  onValueChange={setGenericAssigneeId}
                >
                  <SelectTrigger id="plane-generic-assignee">
                    <SelectValue placeholder="Select a project member" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.members
                      .filter(
                        (member) => member.role === null || member.role >= 15,
                      )
                      .map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name || member.email || member.id}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="plane-in-progress-state">
                  Plane state → Faster Fixes: In Progress
                </Label>
                <Select
                  value={inProgressStateId || NO_MAPPING}
                  onValueChange={(value) =>
                    setInProgressStateId(value === NO_MAPPING ? "" : value)
                  }
                >
                  <SelectTrigger id="plane-in-progress-state">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_MAPPING}>No mapping</SelectItem>
                    {data.states.map((state) => (
                      <SelectItem key={state.id} value={state.id}>
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="plane-resolved-state">
                  Plane state → Faster Fixes: Resolved
                </Label>
                <Select
                  value={doneStateId || NO_MAPPING}
                  onValueChange={(value) =>
                    setDoneStateId(value === NO_MAPPING ? "" : value)
                  }
                >
                  <SelectTrigger id="plane-resolved-state">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_MAPPING}>No mapping</SelectItem>
                    {data.states.map((state) => (
                      <SelectItem key={state.id} value={state.id}>
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="plane-comments">Sync comments</Label>
                <Switch
                  id="plane-comments"
                  checked={commentsEnabled}
                  onCheckedChange={setCommentsEnabled}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => save(link.enabled)} disabled={busy}>
                  Save Plane settings
                </Button>
                {!link.enabled && (
                  <Button
                    variant="outline"
                    onClick={() => save(true)}
                    disabled={busy}
                  >
                    Save and enable synchronization
                  </Button>
                )}
              </div>
            </>
          );
        },
      })}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button
          variant="outline"
          onClick={() => void catalog.refetch()}
          disabled={catalog.isFetching}
        >
          Reload Plane settings
        </Button>
        {link.enabled && (
          <Button
            variant="outline"
            onClick={() => update.mutate({ projectId, enabled: false })}
            disabled={busy}
          >
            Pause synchronization
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => unlink.mutate({ projectId })}
          disabled={busy}
        >
          Unlink
        </Button>
      </div>
    </div>
  );
}
