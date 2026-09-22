"use client";

import { useTRPC } from "@/lib/trpc/trpc-client";
import { matchQueryStatus } from "@/utils/tanstack-query/match-query-status";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

type PlaneIssueBadgeProps = { feedbackId: string };

export function PlaneIssueBadge({ feedbackId }: PlaneIssueBadgeProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.planeFeedback.getExport.queryOptions({ feedbackId });
  const query = useQuery({ ...options, refetchInterval: 5000 });
  const mutation = useMutation(
    trpc.planeFeedback.createIssue.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: options.queryKey });
        toast.success("Plane export queued.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return matchQueryStatus(query, {
    Loading: (
      <span className="text-muted-foreground text-xs">
        Loading Plane connection…
      </span>
    ),
    Errored: (
      <p className="text-destructive text-xs">
        Could not load the Plane export.
      </p>
    ),
    Empty: <></>,
    Success: ({ data }) => {
      if (!data.active && !data.issue && !data.operation) return <></>;
      const pending =
        data.operation?.status === "pending" ||
        data.operation?.status === "processing";
      const complete = data.operation?.status === "complete";
      return (
        <section
          aria-label="Plane export"
          className="flex flex-col gap-2 rounded-md border p-3 text-sm"
        >
          <h4 className="font-medium">Plane</h4>
          {data.issue && (
            <a
              href={data.issue.issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 hover:underline"
            >
              {data.issue.issueIdentifier}
              <ExternalLink className="size-3" />
            </a>
          )}
          {!data.active && (
            <p className="text-muted-foreground text-xs">
              Synchronization paused. Check the Plane connection in settings.
            </p>
          )}
          {data.operation && (
            <p className="text-muted-foreground text-xs">
              Export: {data.operation.status}. Screenshot:{" "}
              {data.operation.screenshotStatus}. Diagnostics:{" "}
              {data.operation.diagnosticsStatus}.
            </p>
          )}
          {data.operation?.assignmentNote && (
            <p className="text-muted-foreground text-xs">
              {data.operation.assignmentNote}
            </p>
          )}
          {data.operation?.lastError && (
            <p role="alert" className="text-destructive text-xs">
              {data.operation.lastError}
            </p>
          )}
          {data.canExport && !complete && (
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending || pending}
              onClick={() => mutation.mutate({ feedbackId })}
            >
              {pending
                ? "Export queued"
                : data.operation
                  ? "Retry Plane export"
                  : "Create Plane issue"}
            </Button>
          )}
        </section>
      );
    },
  });
}
