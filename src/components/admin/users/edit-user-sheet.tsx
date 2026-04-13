"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { updateUserAction } from "@/actions/users";
import { UserDetailsFields } from "@/components/admin/users/user-details-fields";
import { UserFormSheet } from "@/components/admin/users/user-form-sheet";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { updateUserSchema, type UpdateUserInput } from "@/lib/validation/users";
import type { UserRow } from "./users-management";

function getDefaultValues(row: UserRow): UpdateUserInput {
  return {
    fullName: row.fullName,
    username: row.username,
    role: row.role,
    temporaryPassword: "",
  };
}

export function EditUserSheet({
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
  const form = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: getDefaultValues(row),
  });

  const isSelf = row.id === currentUserId;
  const isLastAdmin = row.role === "admin" && adminCount === 1;
  const roleDescription = isSelf
    ? "You cannot change your own role from the users table."
    : isLastAdmin
      ? "At least one admin account must remain."
      : undefined;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      form.reset(getDefaultValues(row));
      form.clearErrors();
      setServerMessage(null);
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    setServerMessage(null);
    form.clearErrors();

    startTransition(async () => {
      const result = await updateUserAction(row.id, values);

      if (!result.ok) {
        setServerMessage(result.message);

        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            if (message) {
              form.setError(field as keyof UpdateUserInput, {
                message,
              });
            }
          }
        }

        return;
      }

      handleOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <UserFormSheet
        description={`Update access details for ${row.fullName}.`}
        isPending={isPending}
        onOpenChange={handleOpenChange}
        onSubmit={onSubmit}
        open={open}
        pendingLabel="Saving..."
        serverMessage={serverMessage}
        submitLabel="Save changes"
        title="Edit user"
        trigger={
          <Button size="xs" type="button" variant="outline">
            Edit
          </Button>
        }
      >
        <UserDetailsFields
          form={form}
          roleDescription={roleDescription}
          roleDisabled={isSelf || isLastAdmin}
        />
        {isSelf ? (
          <p className="text-xs text-muted-foreground">
            Use Settings to change your own password.
          </p>
        ) : (
          <FormField
            control={form.control}
            name="temporaryPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Temporary password</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Leave blank to keep current password"
                    type="password"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Leave this empty to keep the existing password. If set, the
                  user will be forced to change it on their next request.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </UserFormSheet>
    </Form>
  );
}
