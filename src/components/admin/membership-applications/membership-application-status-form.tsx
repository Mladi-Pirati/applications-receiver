"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { updateMembershipApplicationStatusAction } from "@/actions/membership-applications";
import { Button } from "@/components/ui/button";
import {
  membershipApplicationStatusLabels,
  membershipApplicationStatuses,
  type MembershipApplicationStatus,
} from "@/lib/membership-applications";

export function MembershipApplicationStatusForm({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: MembershipApplicationStatus;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = React.useState(currentStatus);
  const [feedback, setFeedback] = React.useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setNextStatus(currentStatus);
  }, [currentStatus]);

  const hasChanges = nextStatus !== currentStatus;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasChanges) {
      return;
    }

    setFeedback(null);

    startTransition(async () => {
      const result = await updateMembershipApplicationStatusAction(
        applicationId,
        nextStatus,
      );

      if (!result.ok) {
        setFeedback({
          kind: "error",
          message: result.message,
        });
        return;
      }

      setFeedback({
        kind: "success",
        message: "Status updated.",
      });
      router.refresh();
    });
  };

  return (
    <form className="grid gap-2 sm:max-w-xs" onSubmit={handleSubmit}>
      <label className="text-xs font-medium text-foreground" htmlFor="status">
        Review status
      </label>
      <select
        className="h-8 w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        disabled={isPending}
        id="status"
        onChange={(event) =>
          setNextStatus(event.target.value as MembershipApplicationStatus)
        }
        value={nextStatus}
      >
        {membershipApplicationStatuses.map((status) => (
          <option key={status} value={status}>
            {membershipApplicationStatusLabels[status]}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <Button disabled={isPending || !hasChanges} type="submit">
          {isPending ? "Saving..." : "Save status"}
        </Button>
        {feedback ? (
          <p
            className={
              feedback.kind === "error"
                ? "text-xs font-medium text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
