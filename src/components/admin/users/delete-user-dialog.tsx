"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { deleteUserAction } from "@/actions/users";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { UserRow } from "./users-management";

export function DeleteUserDialog({
  adminCount,
  currentUserId,
  row,
}: {
  adminCount: number;
  currentUserId: string;
  row: UserRow;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [serverMessage, setServerMessage] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const isSelf = row.id === currentUserId;
  const isLastAdmin = row.role === "admin" && adminCount === 1;
  const isDisabled = isSelf || isLastAdmin;

  const handleDelete = () => {
    setServerMessage(null);

    startTransition(async () => {
      const result = await deleteUserAction(row.id);

      if (!result.ok) {
        setServerMessage(result.message);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button
          disabled={isDisabled}
          size="xs"
          type="button"
          variant="destructive"
        >
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user</AlertDialogTitle>
          <AlertDialogDescription>
            Delete {row.fullName} (@{row.username}) permanently. This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {serverMessage ? (
          <p className="text-xs font-medium text-destructive">
            {serverMessage}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            disabled={isPending}
            onClick={handleDelete}
            type="button"
            variant="destructive"
          >
            {isPending ? "Deleting..." : "Delete user"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
