"use client";

import { useTRPC } from "@/lib/trpc/trpc-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveOrganization } from "@/lib/auth";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import * as React from "react";
import type { GetPlaneInstallationOutput } from "./get-plane-installation.trpc.query";

type PlaneConnectedProps = {
  installation: NonNullable<GetPlaneInstallationOutput["installation"]>;
};

export function PlaneConnected({ installation }: PlaneConnectedProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: activeOrg } = useActiveOrganization();
  const [memberEmail, setMemberEmail] = React.useState("");
  const members = useQuery(
    trpc.authenticated.integrations.plane.listMembers.queryOptions(),
  );
  const invite = useMutation(
    trpc.authenticated.integrations.plane.inviteMember.mutationOptions({
      onSuccess: () => {
        setMemberEmail("");
        toast.success("Invitation created.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const disconnect = useMutation(
    trpc.authenticated.integrations.plane.disconnect.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey:
            trpc.authenticated.integrations.plane.getInstallation.queryKey(),
        });
        toast.success("Plane disconnected.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const requiresReconnect = installation.healthState !== "connected";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <span className="font-medium">{installation.workspaceName}</span>
        <span className="text-muted-foreground text-sm">
          Connected
          {installation.installedByName
            ? ` by ${installation.installedByName}`
            : ""}{" "}
          on{" "}
          {new Date(installation.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>

      {requiresReconnect ? (
        <div className="border-destructive/50 rounded-md border p-3 text-sm">
          <p className="text-destructive font-medium">Reconnection required</p>
          <p className="text-muted-foreground mt-1">
            Plane authorization is not active. Reconnect to resume syncing.
          </p>
          <Button size="sm" className="mt-3" asChild>
            <a href="/api/plane/install">Reconnect</a>
          </Button>
        </div>
      ) : null}

      {activeOrg && !requiresReconnect ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <span className="text-sm font-medium">
            Invite a Plane member to Faster Fixes
          </span>
          <p className="text-muted-foreground text-xs">
            Plane Admin, Member, and Guest accounts are eligible. They are
            invited as Faster Fixes members.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="plane-member-email" className="sr-only">
                Plane member email
              </Label>
              <Input
                id="plane-member-email"
                type="email"
                list="plane-members"
                value={memberEmail}
                onChange={(event) => setMemberEmail(event.target.value)}
                placeholder="member@example.com"
              />
            </div>
            <datalist id="plane-members">
              {members.data?.map((member) =>
                member.email ? (
                  <option key={member.id} value={member.email}>
                    {member.name}
                  </option>
                ) : null,
              )}
            </datalist>
            <Button
              size="sm"
              disabled={!memberEmail || invite.isPending}
              onClick={() =>
                invite.mutate({
                  organizationId: activeOrg.id,
                  email: memberEmail,
                })
              }
            >
              {invite.isPending ? "Inviting..." : "Invite"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <a
            href={`https://app.plane.so/${installation.workspaceSlug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Plane
            <ExternalLink className="ml-1 size-3" />
          </a>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              Disconnect
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect Plane?</AlertDialogTitle>
              <AlertDialogDescription>
                New feedback will stop syncing. Existing Plane work items and
                Faster Fixes links will be preserved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => disconnect.mutate()}>
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
