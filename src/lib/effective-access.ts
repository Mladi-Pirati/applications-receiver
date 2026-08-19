import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  accessApplications,
  groupApplicationAccess,
  groupRoles,
  memberApplicationAccess,
  memberGroups,
  memberRoles,
  permissions,
  rolePermissions,
  roles,
} from "@/db/schema";
import { getMemberEffectiveRoleIds } from "@/lib/members-query";

export type EffectiveAccessRole = {
  id: string;
  key: string;
  name: string;
};

export type EffectiveAccessApplication = {
  id: string;
  name: string;
  keycloakClientId: string;
};

export type EffectiveAccess = {
  /** Merged, deduped role IDs (direct + enabled-group-derived). */
  roleIds: Array<string>;
  /** Roles the member effectively holds. */
  roles: Array<EffectiveAccessRole>;
  /** Permission keys granted through any effective role. */
  permissionKeys: Array<string>;
  /** Merged, deduped access-application IDs (direct + group-derived). */
  applicationIds: Array<string>;
  /** Access applications the member can effectively use. */
  applications: Array<EffectiveAccessApplication>;
};

/**
 * Merge direct and group-derived assignments into one effective access set.
 * Precedence/dedup rule (documented in `docs/deck-authorization.md`): direct
 * and group-derived assignments carry equal weight; the effective set is the
 * plain union with duplicates removed. There is no group enable/disable flag —
 * revocation is assignment/group-role removal, which takes effect immediately
 * because nothing here is cached.
 */
export function mergeEffectiveAccess(input: {
  directRoleIds: Array<string>;
  groupRoleIds: Array<string>;
  roles: Array<EffectiveAccessRole>;
  permissions: Array<{ roleId: string; key: string }>;
  directApplicationIds: Array<string>;
  groupApplicationIds: Array<string>;
  applications: Array<EffectiveAccessApplication>;
}): EffectiveAccess {
  const roleIds = [
    ...new Set([...input.directRoleIds, ...input.groupRoleIds]),
  ];
  const roleIdSet = new Set(roleIds);

  const permissionKeys = [
    ...new Set(
      input.permissions
        .filter((permission) => roleIdSet.has(permission.roleId))
        .map((permission) => permission.key),
    ),
  ];

  const applicationIds = [
    ...new Set([...input.directApplicationIds, ...input.groupApplicationIds]),
  ];
  const applicationIdSet = new Set(applicationIds);

  return {
    roleIds,
    roles: input.roles.filter((role) => roleIdSet.has(role.id)),
    permissionKeys,
    applicationIds,
    applications: input.applications.filter((application) =>
      applicationIdSet.has(application.id),
    ),
  };
}

async function getGroupDerivedRoleIds(memberId: string) {
  const rows = await db
    .select({ roleId: groupRoles.roleId })
    .from(memberGroups)
    .innerJoin(groupRoles, eq(memberGroups.groupId, groupRoles.groupId))
    .where(eq(memberGroups.memberId, memberId));

  return rows.map((row) => row.roleId);
}

async function getGroupDerivedApplicationIds(memberId: string) {
  const rows = await db
    .select({ applicationId: groupApplicationAccess.applicationId })
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
    );

  return rows.map((row) => row.applicationId);
}

async function getDirectApplicationIds(memberId: string) {
  const rows = await db
    .select({ applicationId: memberApplicationAccess.applicationId })
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
    );

  return rows.map((row) => row.applicationId);
}

/**
 * Compute the authoritative effective access for a member: merged direct and
 * enabled-group-derived roles, the permissions those roles grant, and the
 * access applications (direct + group-derived, non-archived). Used by Helm's
 * bearer endpoints so Deck reads one authoritative capability set.
 */
export async function getEffectiveAccess(
  memberId: string,
): Promise<EffectiveAccess> {
  const effectiveRoleIds = await getMemberEffectiveRoleIds(memberId);

  const [
    groupRoleIds,
    directRoleRows,
    permissionRows,
    directApplicationIds,
    groupApplicationIds,
  ] = await Promise.all([
    getGroupDerivedRoleIds(memberId),
    db
      .select({ roleId: memberRoles.roleId })
      .from(memberRoles)
      .where(eq(memberRoles.memberId, memberId)),
    effectiveRoleIds.length
      ? db
          .select({ roleId: rolePermissions.roleId, key: permissions.key })
          .from(rolePermissions)
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(inArray(rolePermissions.roleId, effectiveRoleIds))
      : Promise.resolve([] as Array<{ roleId: string; key: string }>),
    getDirectApplicationIds(memberId),
    getGroupDerivedApplicationIds(memberId),
  ]);

  const roleRows = effectiveRoleIds.length
    ? await db
        .select({ id: roles.id, key: roles.key, name: roles.name })
        .from(roles)
        .where(inArray(roles.id, effectiveRoleIds))
    : [];

  const allApplicationIds = [
    ...new Set([...directApplicationIds, ...groupApplicationIds]),
  ];
  const applicationRows = allApplicationIds.length
    ? await db
        .select({
          id: accessApplications.id,
          name: accessApplications.name,
          keycloakClientId: accessApplications.keycloakClientId,
        })
        .from(accessApplications)
        .where(
          and(
            inArray(accessApplications.id, allApplicationIds),
            isNull(accessApplications.archivedAt),
          ),
        )
    : [];

  return mergeEffectiveAccess({
    directRoleIds: directRoleRows.map((row) => row.roleId),
    groupRoleIds,
    roles: roleRows,
    permissions: permissionRows,
    directApplicationIds,
    groupApplicationIds,
    applications: applicationRows,
  });
}
