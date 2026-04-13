"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { changePasswordAction } from "@/actions/settings";
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
import {
  createChangePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validation/settings";

const defaultValues: ChangePasswordInput = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function PasswordChangeForm({
  forcePasswordChange,
}: {
  forcePasswordChange: boolean;
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = React.useState<string | null>(null);
  const [messageTone, setMessageTone] = React.useState<"success" | "error">(
    "error",
  );
  const [isPending, startTransition] = React.useTransition();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(
      createChangePasswordSchema({
        requiresCurrentPassword: !forcePasswordChange,
      }),
    ),
    defaultValues,
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerMessage(null);
    setMessageTone("error");
    form.clearErrors();

    startTransition(async () => {
      const result = await changePasswordAction(values);

      setServerMessage(result.message);
      setMessageTone(result.ok ? "success" : "error");

      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            if (message) {
              form.setError(field as keyof ChangePasswordInput, {
                message,
              });
            }
          }
        }

        if (result.redirectTo) {
          router.replace(result.redirectTo);
        }

        return;
      }

      form.reset(defaultValues);

      if (result.redirectTo) {
        router.replace(result.redirectTo);
        return;
      }

      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        {!forcePasswordChange ? (
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="current-password"
                    placeholder="Your current password"
                    type="password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  type="password"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Choose a password that is different from your current one.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input
                  autoComplete="new-password"
                  placeholder="Repeat the new password"
                  type="password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {serverMessage ? (
          <p
            className={
              messageTone === "success"
                ? "text-xs font-medium text-foreground"
                : "text-xs font-medium text-destructive"
            }
          >
            {serverMessage}
          </p>
        ) : null}
        <Button className="w-full sm:w-fit" disabled={isPending} type="submit">
          {isPending ? "Updating..." : "Update password"}
        </Button>
      </form>
    </Form>
  );
}
