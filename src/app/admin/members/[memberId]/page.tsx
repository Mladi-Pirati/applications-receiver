import { asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { MemberDetailManagement } from "@/components/admin/members/member-detail-management";
import { db } from "@/db";
import {
  accessApplications,
  addresses,
  contacts,
  groupDiscordRoles,
  groups,
  memberDiscordRoles,
  memberDiscordRoleSyncs,
  memberGroups,
  memberApplicationAccess,
  memberRoles,
  members,
  memberships,
  roles,
} from "@/db/schema";
import {
  getCurrentUserHighestRoleRank,
  getCurrentUserPermissions,
  requirePermission,
} from "@/lib/auth/permissions";
import { getProfilePictureDescriptor } from "@/lib/profile-pictures";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  await requirePermission("members.read");
  const { memberId } = await params;
  const { permissions } = await getCurrentUserPermissions();
  const canDelete = permissions.includes("members.delete");
  const canUpdate = permissions.includes("members.update");
  const canManageRoles = permissions.includes("members.role_management");
  const highestManagedRank = canManageRoles
    ? await getCurrentUserHighestRoleRank()
    : null;

  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  if (!member) notFound();

  const [
    contactRows,
    addressRows,
    membershipRows,
    roleRows,
    assignedRoleRows,
    applicationRows,
    assignedApplicationRows,
    groupRows,
    assignedGroupRows,
    directDiscordRoleRows,
    groupDiscordRoleRows,
    discordSyncRows,
  ] = await Promise.all([
    db
      .select({
        id: contacts.id,
        isPrimary: contacts.isPrimary,
        label: contacts.label,
        sortOrder: contacts.sortOrder,
        type: contacts.type,
        value: contacts.value,
      })
      .from(contacts)
      .where(eq(contacts.memberId, member.id))
      .orderBy(asc(contacts.sortOrder)),
    db
      .select({
        city: addresses.city,
        country: addresses.country,
        id: addresses.id,
        label: addresses.label,
        postalCode: addresses.postalCode,
        street: addresses.street,
      })
      .from(addresses)
      .where(eq(addresses.memberId, member.id))
      .orderBy(asc(addresses.label), asc(addresses.city)),
    db
      .select({
        endedAt: memberships.endedAt,
        expiresAt: memberships.expiresAt,
        extendedAt: memberships.extendedAt,
        id: memberships.id,
      })
      .from(memberships)
      .where(eq(memberships.memberId, member.id))
      .orderBy(desc(memberships.expiresAt)),
    db
      .select({
        id: roles.id,
        key: roles.key,
        name: roles.name,
        rank: roles.rank,
      })
      .from(roles)
      .orderBy(asc(roles.rank)),
    db
      .select({
        id: roles.id,
        key: roles.key,
        name: roles.name,
        rank: roles.rank,
      })
      .from(memberRoles)
      .innerJoin(roles, eq(memberRoles.roleId, roles.id))
      .where(eq(memberRoles.memberId, member.id))
      .orderBy(asc(roles.rank)),
    db
      .select({
        archivedAt: accessApplications.archivedAt,
        description: accessApplications.description,
        id: accessApplications.id,
        keycloakClientId: accessApplications.keycloakClientId,
        keycloakRoleName: accessApplications.keycloakRoleName,
        name: accessApplications.name,
      })
      .from(accessApplications)
      .orderBy(
        asc(accessApplications.archivedAt),
        asc(accessApplications.name),
      ),
    db
      .select({
        applicationId: memberApplicationAccess.applicationId,
        grantedAt: memberApplicationAccess.grantedAt,
      })
      .from(memberApplicationAccess)
      .where(eq(memberApplicationAccess.memberId, member.id)),
    db
      .select({
        description: groups.description,
        id: groups.id,
        name: groups.name,
      })
      .from(groups)
      .orderBy(asc(groups.name)),
    db
      .select({ groupId: memberGroups.groupId })
      .from(memberGroups)
      .where(eq(memberGroups.memberId, member.id)),
    db
      .select({
        id: memberDiscordRoles.discordRoleId,
        name: memberDiscordRoles.discordRoleName,
      })
      .from(memberDiscordRoles)
      .where(eq(memberDiscordRoles.memberId, member.id)),
    db
      .select({
        id: groupDiscordRoles.discordRoleId,
        name: groupDiscordRoles.discordRoleName,
      })
      .from(memberGroups)
      .innerJoin(
        groupDiscordRoles,
        eq(memberGroups.groupId, groupDiscordRoles.groupId),
      )
      .where(eq(memberGroups.memberId, member.id)),
    db
      .select({
        discordRoleId: memberDiscordRoleSyncs.discordRoleId,
        discordRoleName: memberDiscordRoleSyncs.discordRoleName,
        errorMessage: memberDiscordRoleSyncs.errorMessage,
        status: memberDiscordRoleSyncs.status,
        syncedAt: memberDiscordRoleSyncs.syncedAt,
      })
      .from(memberDiscordRoleSyncs)
      .where(eq(memberDiscordRoleSyncs.memberId, member.id)),
  ]);

  const primaryEmail =
    contactRows.find((contact) => contact.type === "email" && contact.isPrimary)
      ?.value ?? "";
  const discordUsername =
    contactRows.find((contact) => contact.type === "discord")?.value ?? null;
  const desiredDiscordRoles = [
    ...new Map(
      [...directDiscordRoleRows, ...groupDiscordRoleRows].map((role) => [
        role.id,
        role,
      ]),
    ).values(),
  ];

  return (
    <MemberDetailManagement
      addresses={addressRows}
      assignedGroupIds={assignedGroupRows.map((row) => row.groupId)}
      assignedRoles={assignedRoleRows}
      applications={applicationRows.map((application) => ({
        ...application,
        archivedAt: application.archivedAt?.toISOString() ?? null,
      }))}
      assignedApplications={assignedApplicationRows.map((application) => ({
        ...application,
        grantedAt: application.grantedAt.toISOString(),
      }))}
      canManageRoles={canManageRoles}
      highestManagedRank={highestManagedRank}
      canDelete={canDelete}
      canUpdate={canUpdate}
      contacts={contactRows}
      desiredDiscordRoles={desiredDiscordRoles}
      discordSyncs={discordSyncRows.map((row) => ({
        ...row,
        syncedAt: row.syncedAt.toISOString(),
      }))}
      discordUserId={member.discordUserId}
      discordUsername={discordUsername}
      groups={groupRows}
      member={{
        dateOfBirth: member.dateOfBirth,
        disabledAt: member.disabledAt?.toISOString() ?? null,
        firstName: member.firstName,
        fullLegalName: member.fullLegalName,
        id: member.id,
        keycloakId: member.keycloakId,
        lastName: member.lastName,
        notes: member.notes,
        placeOfBirth: member.placeOfBirth,
        primaryEmail,
        profilePicture: getProfilePictureDescriptor(member),
        residenceRegion: member.residenceRegion,
        username: member.username,
      }}
      memberships={membershipRows.map((membership) => ({
        ...membership,
        endedAt: membership.endedAt?.toISOString() ?? null,
        expiresAt: membership.expiresAt?.toISOString() ?? null,
        extendedAt: membership.extendedAt.toISOString(),
      }))}
      roles={roleRows}
    />
  );
}
