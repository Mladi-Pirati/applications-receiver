import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { ProfileManagement } from "@/components/me/profile-management";
import { db } from "@/db";
import { contacts, members } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

export default async function MeProfilePage() {
  const user = await requireUser();
  const member = await db.query.members.findFirst({
    where: eq(members.keycloakId, user.keycloakUserId),
    columns: {
      dateOfBirth: true,
      firstName: true,
      fullLegalName: true,
      id: true,
      lastName: true,
      placeOfBirth: true,
      residenceRegion: true,
      username: true,
    },
    with: {
      addresses: true,
      contacts: {
        orderBy: asc(contacts.sortOrder),
      },
    },
  });

  if (!member) notFound();

  const primaryEmail =
    member.contacts.find(
      (contact) => contact.type === "email" && contact.isPrimary,
    )?.value ?? "";

  return (
    <ProfileManagement
      member={{
        ...member,
        primaryEmail,
      }}
    />
  );
}
