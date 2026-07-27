"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyIcon, LinkIcon, PencilIcon } from "lucide-react";

import {
  generateDiscordLinkCodeAction,
  unlinkDiscordAction,
} from "@/actions/me";
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

export function DiscordLinkDialog({
  discordUserId,
  discordUsername,
}: {
  discordUserId: string | null;
  discordUsername: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const linked = discordUserId !== null;

  function generateCode() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await generateDiscordLinkCodeAction();
      if (result.ok) {
        setCode(result.token);
      } else {
        setError(result.message);
      }
    });
  }

  function copyCode() {
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  function unlink() {
    setError(null);
    startTransition(async () => {
      const result = await unlinkDiscordAction();
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function close() {
    setOpen(false);
    // The member may have completed /verify-link while the dialog was open.
    router.refresh();
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setError(null);
        if (nextOpen) {
          setCode(null);
          if (!linked) generateCode();
        } else if (!linked) {
          router.refresh();
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="xs" type="button" variant="outline">
          {linked ? <PencilIcon /> : <LinkIcon />}
          {linked ? "Manage" : "Link"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {linked ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Discord account</DialogTitle>
              <DialogDescription>
                {discordUsername ? (
                  <>
                    Linked to <strong>@{discordUsername}</strong> (user ID{" "}
                    {discordUserId}).
                  </>
                ) : (
                  <>Linked to Discord user ID {discordUserId}.</>
                )}{" "}
                Unlinking removes the synced Discord roles; you can link again
                at any time with a new code.
              </DialogDescription>
            </DialogHeader>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button
                disabled={isPending}
                onClick={unlink}
                type="button"
                variant="destructive"
              >
                {isPending ? "Unlinking..." : "Unlink Discord"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Link Discord account</DialogTitle>
              <DialogDescription>
                Run the command below in the Discord server. The code is valid
                for 10 minutes and can be used once.
              </DialogDescription>
            </DialogHeader>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {code ? (
              <>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-center font-mono text-lg font-bold tracking-widest">
                    /verify-link code:{code}
                  </code>
                  <Button
                    disabled={isPending}
                    onClick={copyCode}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <CopyIcon />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  After running the command, close this dialog — the linked
                  account shows up here.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isPending ? "Generating code..." : null}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={isPending}
                onClick={generateCode}
                type="button"
                variant="outline"
              >
                Generate new code
              </Button>
              <Button disabled={isPending} onClick={close} type="button">
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
