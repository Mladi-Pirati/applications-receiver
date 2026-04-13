"use client";

import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

type UserFormSheetProps = {
  children: React.ReactNode;
  description: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  open: boolean;
  pendingLabel: string;
  serverMessage?: string | null;
  submitLabel: string;
  title: string;
  trigger?: React.ReactNode;
};

export function UserFormSheet({
  children,
  description,
  isPending,
  onOpenChange,
  onSubmit,
  open,
  pendingLabel,
  serverMessage,
  submitLabel,
  title,
  trigger,
}: UserFormSheetProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent
        className={cn("w-full", isDesktop ? "sm:max-w-lg" : "max-h-[90vh]")}
        side={isDesktop ? "right" : "bottom"}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <form className="grid gap-4 p-4" onSubmit={onSubmit}>
          {children}
          <SheetFooter className="border-t px-0 pb-0">
            {serverMessage ? (
              <p className="flex-1 text-xs font-medium text-destructive">
                {serverMessage}
              </p>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? pendingLabel : submitLabel}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
