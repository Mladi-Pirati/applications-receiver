"use client";

import { useState } from "react";

import { logoutAction } from "@/actions/auth";
import { AdminNavLinks } from "@/components/admin/admin-nav-links";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ListIcon, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { MemberAvatar } from "@/components/shared/member-avatar";
import type { ProfilePictureDescriptor } from "@/lib/profile-pictures";

type AdminMobileNavProps = {
  fullName: string;
  firstName: string;
  lastName: string;
  profilePicture: ProfilePictureDescriptor | null;
  username: string;
  permissions: Array<string>;
};

export function AdminMobileNav({
  fullName,
  firstName,
  lastName,
  profilePicture,
  username,
  permissions,
}: AdminMobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button size="icon-sm" variant="outline">
          <ListIcon className="size-4" />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-xs" side="left">
        <SheetHeader className="border-b">
          <SheetTitle></SheetTitle>
          <div className="flex items-center gap-3 text-left">
            <MemberAvatar firstName={firstName} lastName={lastName} profilePicture={profilePicture} />
            <div className="grid gap-1">
            <p className="text-sm font-medium">{fullName}</p>
            <p className="text-xs text-muted-foreground">@{username}</p>
            </div>
          </div>
        </SheetHeader>
        <div className="grid gap-4 p-4">
          <AdminNavLinks
            permissions={permissions}
            onNavigate={() => setOpen(false)}
          />
          <Separator />
          <Link
            href="/me/profile"
            className={buttonVariants({ variant: "outline" })}
            onClick={() => setOpen(false)}
          >
            <UserIcon />
            My profile
          </Link>
          <Link
            href="/admin/settings"
            className={buttonVariants({ variant: "outline" })}
            onClick={() => setOpen(false)}
          >
            <SettingsIcon />
            Settings
          </Link>
          <form
            action={logoutAction}
            onSubmit={() => {
              setOpen(false);
            }}
          >
            <Button className="w-full" type="submit" variant="destructive">
              <LogOutIcon />
              Log out
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
