"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, LogOutIcon, ShieldIcon, UserIcon } from "lucide-react";

import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MeNavProps = {
  fullName: string;
  showAdminLink: boolean;
};

const linkClassName =
  "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors";

export function MeNav({ fullName, showAdminLink }: MeNavProps) {
  const pathname = usePathname();
  const items = [
    {
      href: "/me",
      label: "Home",
      icon: HomeIcon,
      active: pathname === "/me",
      show: true,
    },
    {
      href: "/me/profile",
      label: "Profile",
      icon: UserIcon,
      active: pathname.startsWith("/me/profile"),
      show: true,
    },
    {
      href: "/admin",
      label: "Admin",
      icon: ShieldIcon,
      active: pathname.startsWith("/admin"),
      show: showAdminLink,
    },
  ].filter((item) => item.show);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <nav className="flex flex-wrap items-center justify-end gap-2">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              className={cn(
                linkClassName,
                item.active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted",
              )}
              href={item.href}
              key={item.href}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="hidden text-right text-xs font-medium text-muted-foreground sm:block">
        {fullName}
      </div>
      <form action={logoutAction}>
        <Button size="sm" type="submit" variant="destructive">
          <LogOutIcon />
          Log out
        </Button>
      </form>
    </div>
  );
}
