"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { createUserAction } from "@/actions/users";
import { UserDetailsFields } from "@/components/admin/users/user-details-fields";
import { UserFormSheet } from "@/components/admin/users/user-form-sheet";
import { type CreateUserInput, createUserSchema } from "@/lib/validation/users";
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

const defaultValues: CreateUserInput = {
  fullName: "",
  username: "",
  initialPassword: "",
  role: "viewer",
};

export function AddUserSheet() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [serverMessage, setServerMessage] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues,
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      form.reset(defaultValues);
      form.clearErrors();
      setServerMessage(null);
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    setServerMessage(null);
    form.clearErrors();

    startTransition(async () => {
      const result = await createUserAction(values);

      if (!result.ok) {
        setServerMessage(result.message);

        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            if (message) {
              form.setError(field as keyof CreateUserInput, {
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
        description="Create a new admin or viewer account. The password entered here is temporary and must be changed on first login."
        isPending={isPending}
        onOpenChange={handleOpenChange}
        onSubmit={onSubmit}
        open={open}
        pendingLabel="Creating..."
        serverMessage={serverMessage}
        submitLabel="Create user"
        title="Add user"
        trigger={<Button>Add user</Button>}
      >
        <UserDetailsFields form={form} />
        <FormField
          control={form.control}
          name="initialPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Temporary password</FormLabel>
              <FormControl>
                <Input
                  placeholder="At least 8 characters"
                  type="password"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                The user will be required to choose a new password after signing
                in.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </UserFormSheet>
    </Form>
  );
}
