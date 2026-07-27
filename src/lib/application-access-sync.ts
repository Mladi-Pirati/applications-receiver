import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  accessApplications,
  groupApplicationAccess,
  memberApplicationAccess,
  memberGroups,
  members,
} from "@/db/schema";
import { createKeycloakAdminClient } from "@/lib/keycloak/admin-client";

export type ApplicationAccessRole = {
  keycloakClientId: string;
  keycloakRoleName: string;
};

function toAssignment(application: ApplicationAccessRole) {
  return {
    clientId: application.keycloakClientId,
    roleName: application.keycloakRoleName,
  };
}

export async function addKeycloakApplicationRole(values: {
  application: ApplicationAccessRole;
  keycloakId: string;
}) {
  await createKeycloakAdminClient().addClientRole(
    values.keycloakId,
    toAssignment(values.application),
  );
}

export async function removeKeycloakApplicationRole(values: {
  application: ApplicationAccessRole;
  keycloakId: string;
}) {
  await createKeycloakAdminClient().removeClientRole(
    values.keycloakId,
    toAssignment(values.application),
  );
}

export async function syncMemberApplicationRoles(values: {
  disabled: boolean;
  keycloakId: string;
  memberId: string;
}) {
  const rows = await getEffectiveApplicationAccess(values.memberId);

  const keycloak = createKeycloakAdminClient();
  for (const row of rows) {
    const assignment = toAssignment(row);
    if (values.disabled) {
      await keycloak.removeClientRole(values.keycloakId, assignment);
    } else {
      await keycloak.addClientRole(values.keycloakId, assignment);
    }
  }
}

export async function getEffectiveApplicationAccess(memberId: string) {
  const [directRows, groupRows] = await Promise.all([
    db
      .select({
        id: accessApplications.id,
        keycloakClientId: accessApplications.keycloakClientId,
        keycloakRoleName: accessApplications.keycloakRoleName,
      })
      .from(memberApplicationAccess)
      .innerJoin(
        accessApplications,
        eq(memberApplicationAccess.applicationId, accessApplications.id),
      )
      .where(
        and(
          eq(memberApplicationAccess.memberId, memberId),
          isNull(accessApplications.archivedAt),
        ),
      ),
    db
      .select({
        id: accessApplications.id,
        keycloakClientId: accessApplications.keycloakClientId,
        keycloakRoleName: accessApplications.keycloakRoleName,
      })
      .from(memberGroups)
      .innerJoin(
        groupApplicationAccess,
        eq(memberGroups.groupId, groupApplicationAccess.groupId),
      )
      .innerJoin(
        accessApplications,
        eq(groupApplicationAccess.applicationId, accessApplications.id),
      )
      .where(
        and(
          eq(memberGroups.memberId, memberId),
          isNull(accessApplications.archivedAt),
        ),
      ),
  ]);

  return [
    ...new Map(
      [...directRows, ...groupRows].map((application) => [
        application.id,
        application,
      ]),
    ).values(),
  ];
}

export async function isApplicationGrantedByGroup(
  memberId: string,
  applicationId: string,
) {
  const rows = await db
    .select({ groupId: memberGroups.groupId })
    .from(memberGroups)
    .innerJoin(
      groupApplicationAccess,
      eq(memberGroups.groupId, groupApplicationAccess.groupId),
    )
    .where(
      and(
        eq(memberGroups.memberId, memberId),
        eq(groupApplicationAccess.applicationId, applicationId),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

async function getEnabledMembersWithApplicationAccess(applicationId: string) {
  const [directRows, groupRows] = await Promise.all([
    db
      .select({ keycloakId: members.keycloakId })
      .from(memberApplicationAccess)
      .innerJoin(members, eq(memberApplicationAccess.memberId, members.id))
      .where(
        and(
          eq(memberApplicationAccess.applicationId, applicationId),
          isNull(members.disabledAt),
        ),
      ),
    db
      .select({ keycloakId: members.keycloakId })
      .from(memberGroups)
      .innerJoin(
        groupApplicationAccess,
        eq(memberGroups.groupId, groupApplicationAccess.groupId),
      )
      .innerJoin(members, eq(memberGroups.memberId, members.id))
      .where(
        and(
          eq(groupApplicationAccess.applicationId, applicationId),
          isNull(members.disabledAt),
        ),
      ),
  ]);

  return [...new Set([...directRows, ...groupRows].map((row) => row.keycloakId))];
}

async function getEnabledMembersWithAnyApplicationAccess(applicationId: string) {
  return getEnabledMembersWithApplicationAccess(applicationId);
}

export async function getMembersWithGroupApplicationAccess(groupId: string) {
  return db
    .select({
      keycloakId: members.keycloakId,
      memberId: memberGroups.memberId,
    })
    .from(memberGroups)
    .innerJoin(members, eq(memberGroups.memberId, members.id))
    .where(eq(memberGroups.groupId, groupId));
}

export async function syncArchivedApplicationRoles(values: {
  applicationId: string;
  archived: boolean;
}) {
  const application = await db.query.accessApplications.findFirst({
    where: eq(accessApplications.id, values.applicationId),
  });
  if (!application) return;
  const keycloakIds = await getEnabledMembersWithAnyApplicationAccess(
    values.applicationId,
  );

  const keycloak = createKeycloakAdminClient();
  for (const keycloakId of keycloakIds) {
    const assignment = toAssignment(application);
    if (values.archived) {
      await keycloak.removeClientRole(keycloakId, assignment);
    } else {
      await keycloak.addClientRole(keycloakId, assignment);
    }
  }
}

export async function syncApplicationMappingChange(values: {
  applicationId: string;
  nextApplication: ApplicationAccessRole;
  previousApplication: ApplicationAccessRole;
}) {
  const keycloakIds = await getEnabledMembersWithAnyApplicationAccess(
    values.applicationId,
  );

  const keycloak = createKeycloakAdminClient();
  for (const keycloakId of keycloakIds) {
    await keycloak.removeClientRole(
      keycloakId,
      toAssignment(values.previousApplication),
    );
    await keycloak.addClientRole(
      keycloakId,
      toAssignment(values.nextApplication),
    );
  }
}
