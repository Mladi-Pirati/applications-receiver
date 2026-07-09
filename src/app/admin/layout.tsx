import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOutIcon, UserIcon } from "lucide-react";

import { logoutAction } from "@/actions/auth";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminNavLinks } from "@/components/admin/admin-nav-links";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/session";
import { getCurrentUserPermissions } from "@/lib/auth/permissions";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const { permissions, roles } = await getCurrentUserPermissions();

  if (roles.length === 0) {
    redirect("/me");
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r bg-background lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:self-start">
          <div className="grid shrink-0 gap-4 p-6">
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
              <span>Mladi Pirati - Helm</span>
            </Link>
          </div>
          <Separator />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <AdminNavLinks permissions={permissions} />
          </div>
          <Separator />
          <div className="flex shrink-0 items-center justify-between p-4">
            <div className="grid gap-1">
              <p className="text-sm font-medium">{user.fullName}</p>
              <p className="text-xs text-muted-foreground">@{user.username}</p>
            </div>
            <div className="flex flex-row items-center gap-1">
              <Link
                href="/me/profile"
                className={buttonVariants({ variant: "outline" })}
              >
                <UserIcon />
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
                  <span>Mladi Pirati - Helm</span>
                </Link>
              </div>
              <AdminMobileNav
                fullName={user.fullName}
                permissions={permissions}
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
