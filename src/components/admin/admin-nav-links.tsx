"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { HomeIcon, UserPlusIcon, Users2Icon } from "lucide-react";

type AdminNavLinksProps = {
  forcePasswordChange: boolean;
  isAdmin: boolean;
  onNavigate?: () => void;
};

const baseLinkClassName =
  "flex items-center gap-2 rounded-none border px-3 py-2 text-xs font-medium transition-colors";

export function AdminNavLinks({
  forcePasswordChange,
  isAdmin,
  onNavigate,
}: AdminNavLinksProps) {
  const pathname = usePathname();
  const items = forcePasswordChange
    ? []
    : [
        {
          href: "/admin",
          label: "Dashboard",
          icon: HomeIcon,
          active: pathname === "/admin",
        },
        {
          href: "/admin/membership-applications",
          label: "Membership applications",
          icon: UserPlusIcon,
          active: pathname === "/admin/membership-applications"
        },
        ...(isAdmin
          ? [
              {
                href: "/admin/users",
                label: "Users",
                icon: Users2Icon,
                active: pathname.startsWith("/admin/users"),
              },
            ]
          : []),
      ];

  return (
    <nav className="grid gap-2">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Link
            className={cn(
              baseLinkClassName,
              item.active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background hover:bg-muted",
            )}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
