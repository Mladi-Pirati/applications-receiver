import Image from "next/image";
import Link from "next/link";

import { MeNav } from "@/components/me/me-nav";
import { Separator } from "@/components/ui/separator";
import { hasAnyRole } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/db";
import { members } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProfilePictureDescriptor } from "@/lib/profile-pictures";

export default async function MeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const [showAdminLink, member] = await Promise.all([
    hasAnyRole(),
    db.query.members.findFirst({
      columns: {
        firstName: true,
        id: true,
        lastName: true,
        profilePictureBlurhash: true,
        profilePictureVersion: true,
      },
      where: eq(members.id, user.id),
    }),
  ]);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            className="flex items-center gap-3 text-sm font-semibold tracking-tight"
            href="/me"
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
          <MeNav
            firstName={member?.firstName ?? user.fullName}
            fullName={user.fullName}
            lastName={member?.lastName ?? ""}
            profilePicture={member ? getProfilePictureDescriptor(member) : null}
            showAdminLink={showAdminLink}
          />
        </div>
      </header>
      <Separator />
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
