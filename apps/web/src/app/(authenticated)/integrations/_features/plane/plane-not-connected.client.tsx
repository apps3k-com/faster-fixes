"use client";

import { Button } from "@workspace/ui/components/button";
import { Cloud } from "lucide-react";

export function PlaneNotConnected({ enabled = true }: { enabled?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {enabled
          ? "Connect a Plane Cloud workspace to link projects and mirror feedback as Plane work items."
          : "Plane integration is disabled for this Faster Fixes instance. An infrastructure admin must enable it before an OAuth connection can be configured."}
      </p>
      {enabled ? (
        <Button asChild>
          <a href="/api/plane/install">
            <Cloud className="size-4" />
            Connect to Plane
          </a>
        </Button>
      ) : null}
    </div>
  );
}
