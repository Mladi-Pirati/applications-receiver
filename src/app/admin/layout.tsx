import Image from "next/image";
import Link from "next/link";

import { logoutAction } from "@/actions/auth";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminNavLinks } from "@/components/admin/admin-nav-links";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/session";
import { LogOutIcon, SettingsIcon } from "lucide-react";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r bg-background lg:flex lg:flex-col">
          <div className="grid gap-4 p-6">
            <Link
              className="flex items-center gap-3 text-sm font-semibold tracking-tight"
              href="/admin"
            >
              <Image
                alt="Mladi Pirati logo"
                className="shrink-0"
                height={36}
                priority
                src="/logo.png"
                width={36}
              />
              <span>Mladi Pirati - Prijave</span>
            </Link>
          </div>
          <Separator />
          <div className="flex-1 p-4">
            <AdminNavLinks
              forcePasswordChange={user.forcePasswordChange}
              isAdmin={user.role === "admin"}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between p-4">
            <div className="grid gap-1">
              <p className="text-sm font-medium">{user.fullName}</p>
              <p className="text-xs text-muted-foreground">@{user.username}</p>
              <Badge
                className="mt-1 w-fit"
                variant={user.role === "admin" ? "default" : "outline"}
              >
                {user.role}
              </Badge>
            </div>
            <div className="flex flex-row items-center gap-1">
              <Link href="" className={buttonVariants({ variant: "outline" })}>
                <SettingsIcon />
              </Link>
              <form action={logoutAction}>
                <Button size="lg" type="submit" variant="destructive">
                  <LogOutIcon />
                </Button>
              </form>
            </div>
          </div>
        </aside>
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="border-b bg-background px-4 py-3 lg:hidden">
            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <Link
                  className="flex items-center gap-2 text-sm font-semibold tracking-tight"
                  href="/admin"
                >
                  <Image
                    alt="Mladi Pirati logo"
                    className="shrink-0"
                    height={28}
                    priority
                    src="/logo.png"
                    width={28}
                  />
                  <span>Mladi Pirati - Prijave</span>
                </Link>
              </div>
              <AdminMobileNav
                forcePasswordChange={user.forcePasswordChange}
                fullName={user.fullName}
                role={user.role}
                username={user.username}
              />
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
