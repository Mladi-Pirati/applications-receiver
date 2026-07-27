"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  CircleUserIcon,
  HomeIcon,
  MailIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react";

type AdminNavLinksProps = {
  permissions: Array<string>;
  onNavigate?: () => void;
};

const baseLinkClassName =
  "flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors";

export function AdminNavLinks({
  permissions,
  onNavigate,
}: AdminNavLinksProps) {
  const pathname = usePathname();
  const items = [
    {
      href: "/admin",
      label: "Dashboard",
      icon: HomeIcon,
      active: pathname === "/admin",
      requiredPermission: null,
    },
    {
      href: "/admin/members",
      label: "Members",
      icon: UsersIcon,
      active: pathname.startsWith("/admin/members"),
      requiredPermission: "members.read",
    },
    {
      href: "/admin/newsletters",
      label: "Newsletters",
      icon: MailIcon,
      active: pathname.startsWith("/admin/newsletters"),
      requiredPermission: "newsletters.read",
    },
    {
      href: "/admin/settings/roles",
      label: "Access Control",
      icon: ShieldIcon,
      active: pathname.startsWith("/admin/settings/roles"),
      requiredPermission: "access-control.manage_roles",
    },
    {
      href: "/me",
      label: "Member area",
      icon: CircleUserIcon,
      active: pathname.startsWith("/me"),
      requiredPermission: null,
    },
  ].filter(
    (item) =>
      item.requiredPermission === null ||
      permissions.includes(item.requiredPermission)
  );

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
