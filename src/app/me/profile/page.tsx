import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { ProfileManagement } from "@/components/me/profile-management";
import { ProfilePictureManagement } from "@/components/me/profile-picture-management";
import { db } from "@/db";
import { contacts, members } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getProfilePictureDescriptor } from "@/lib/profile-pictures";

export default async function MeProfilePage() {
  const user = await requireUser();
  const member = await db.query.members.findFirst({
    where: eq(members.keycloakId, user.keycloakUserId),
    columns: {
      dateOfBirth: true,
      discordUserId: true,
      firstName: true,
      fullLegalName: true,
      id: true,
      lastName: true,
      placeOfBirth: true,
      residenceRegion: true,
      username: true,
      profilePictureBlurhash: true,
      profilePictureVersion: true,
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
    <div className="grid gap-6">
      <ProfilePictureManagement
        firstName={member.firstName}
        lastName={member.lastName}
        profilePicture={getProfilePictureDescriptor(member)}
      />
      <ProfileManagement
      member={{
        ...member,
        primaryEmail,
      }}
      />
    </div>
  );
}
