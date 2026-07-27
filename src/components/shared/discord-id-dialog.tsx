"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DiscordIdActionResult =
  | { ok: true; message?: string }
  | {
      ok: false;
      message: string;
      fieldErrors?: Partial<Record<"discordUserId", string>>;
    };

export function DiscordIdDialog({
  action,
  currentDiscordUserId,
  disabled,
}: {
  action: (discordUserId: string) => Promise<DiscordIdActionResult>;
  currentDiscordUserId: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [discordUserId, setDiscordUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await action(discordUserId);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.fieldErrors?.discordUserId ?? result.message);
      }
    });
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setDiscordUserId(currentDiscordUserId ?? "");
          setError(null);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled} size="xs" type="button" variant="outline">
          <PencilIcon />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Link Discord account</DialogTitle>
            <DialogDescription>
              Enter the Discord user ID of the account. The account must be a
              member of the Discord server — the username is fetched
              automatically and kept up to date. You can look up your own or
              another user&apos;s ID with the{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                /user-id
              </code>{" "}
              command in Discord.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="discordUserId">Discord user ID</Label>
            <Input
              aria-invalid={Boolean(error)}
              autoFocus
              id="discordUserId"
              inputMode="numeric"
              onChange={(event) => {
                setDiscordUserId(event.target.value);
                setError(null);
              }}
              placeholder="123456789012345678"
              required
              value={discordUserId}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button disabled={isPending} type="submit">
              {isPending ? "Checking..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
