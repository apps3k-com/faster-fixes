"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/trpc-client";
import { matchQueryStatus } from "@/utils/tanstack-query/match-query-status";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { toast } from "sonner";

type FeedbackDiscussionProps = { feedbackId: string };

export function FeedbackDiscussion({ feedbackId }: FeedbackDiscussionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(
    null,
  );
  const queryOptions = trpc.feedbackDiscussion.list.queryOptions({
    feedbackId,
  });
  const comments = useQuery({ ...queryOptions, refetchInterval: 15_000 });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
  const onError = (error: { message: string }) => toast.error(error.message);
  const create = useMutation(
    trpc.feedbackDiscussion.create.mutationOptions({
      onSuccess: () => {
        setBody("");
        void refresh();
      },
      onError,
    }),
  );
  const update = useMutation(
    trpc.feedbackDiscussion.update.mutationOptions({
      onSuccess: () => {
        setEditing(null);
        void refresh();
      },
      onError,
    }),
  );
  const remove = useMutation(
    trpc.feedbackDiscussion.delete.mutationOptions({
      onSuccess: refresh,
      onError,
    }),
  );

  return (
    <section aria-label="Team discussion" className="space-y-3 border-t pt-4">
      <div>
        <h4 className="text-sm font-medium">Team discussion</h4>
        <p className="text-muted-foreground text-xs">
          Visible to your team. Shared with Plane when comment sync is enabled.
        </p>
      </div>
      {matchQueryStatus(comments, {
        Loading: <Skeleton className="h-16 w-full" />,
        Errored: (
          <p role="alert" className="text-destructive text-sm">
            Could not load the discussion.
          </p>
        ),
        Empty: (
          <p className="text-muted-foreground text-sm">No comments yet.</p>
        ),
        Success: ({ data }) => (
          <ol className="space-y-4">
            {data.map((comment) => (
              <li key={comment.id} className="space-y-1 rounded-md border p-3">
                <div className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                  <span className="text-foreground font-medium">
                    {comment.authorName}
                  </span>
                  <span>
                    {comment.origin === "PLANE" ? "Plane" : "Faster Fixes"}
                  </span>
                  <time dateTime={comment.createdAt.toISOString()}>
                    {comment.createdAt.toLocaleString()}
                  </time>
                </div>
                {editing && editing.id === comment.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      update.mutate({
                        feedbackId,
                        commentId: comment.id,
                        body: editing.body,
                      });
                    }}
                    className="space-y-2"
                  >
                    <Textarea
                      aria-label="Edit comment"
                      value={editing.body}
                      onChange={(event) =>
                        setEditing({ id: comment.id, body: event.target.value })
                      }
                      maxLength={10000}
                      required
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        type="submit"
                        disabled={update.isPending || !editing.body.trim()}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="text-sm break-words whitespace-pre-wrap">
                    {comment.deletedAt
                      ? "Comment removed by its author."
                      : comment.body}
                  </p>
                )}
                {comment.syncStatus === "remote_missing" && (
                  <p className="text-muted-foreground text-xs">
                    The linked comment was removed in Plane.
                  </p>
                )}
                {comment.syncStatus === "error" && (
                  <p className="text-destructive text-xs">
                    Plane sync failed. A retry is scheduled.
                  </p>
                )}
                {comment.canEdit && editing?.id !== comment.id && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditing({ id: comment.id, body: comment.body })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() =>
                        remove.mutate({ feedbackId, commentId: comment.id })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        ),
      })}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ feedbackId, body });
        }}
      >
        <Textarea
          aria-label="New team comment"
          placeholder="Add a team comment"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={10000}
          required
        />
        <Button
          size="sm"
          type="submit"
          disabled={create.isPending || !body.trim()}
        >
          Add comment
        </Button>
      </form>
    </section>
  );
}
