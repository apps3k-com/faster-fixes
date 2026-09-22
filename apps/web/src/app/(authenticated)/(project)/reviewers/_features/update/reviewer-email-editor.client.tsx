"use client";

import { useTRPC } from "@/lib/trpc/trpc-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Check, Pencil, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

export function ReviewerEmailEditor({
  projectId,
  reviewerId,
  email,
}: {
  projectId: string;
  reviewerId: string;
  email: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(email ?? "");
  const update = useMutation(
    trpc.authenticated.projects.reviewer.updateEmail.mutationOptions({
      onSuccess: () => {
        setEditing(false);
        queryClient.invalidateQueries({
          queryKey: trpc.authenticated.projects.reviewer.list.queryKey({
            projectId,
          }),
        });
        toast.success("Reviewer email updated.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  if (!editing)
    return (
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">{email ?? "—"}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setEditing(true)}
          aria-label="Edit reviewer email"
        >
          <Pencil className="size-3" />
        </Button>
      </div>
    );
  return (
    <div className="flex items-center gap-1">
      <Input
        className="h-8 w-48"
        type="email"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="reviewer@example.com"
      />
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={update.isPending}
        onClick={() => update.mutate({ reviewerId, email: value })}
        aria-label="Save reviewer email"
      >
        <Check className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => {
          setValue(email ?? "");
          setEditing(false);
        }}
        aria-label="Cancel reviewer email edit"
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
