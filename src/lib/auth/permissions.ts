import { cache } from "react";
import { eq, min } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { db } from "@/db";
import {
  memberRoles,
  members,
  permissions,
  rolePermissions,
  roles,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export async function getHighestRoleRank(): Promise<number | null> {
  const [row] = await db.select({ rank: min(roles.rank) }).from(roles);
  return row?.rank === null || row?.rank === undefined
    ? null
    : Number(row.rank);
}

/**
 * Get all permission keys for a given member ID.
 */
async function getMemberPermissionKeys(memberId: string): Promise<Set<string>> {
  const results = await db
    .select({
      permissionKey: permissions.key,
    })
    .from(memberRoles)
    .innerJoin(rolePermissions, eq(memberRoles.roleId, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(memberRoles.memberId, memberId));

  return new Set(results.map((r) => r.permissionKey));
}

/**
 * Check if the current user has a specific permission.
 * Returns false if not authenticated or no permission.
 */
export async function hasPermission(permissionKey: string): Promise<boolean> {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  // Find member by keycloak_id
  const member = await db.query.members.findFirst({
    where: eq(members.keycloakId, user.keycloakUserId),
    columns: { id: true },
  });

  if (!member) {
    return false;
  }

  const permissionKeys = await getMemberPermissionKeys(member.id);
  return permissionKeys.has(permissionKey);
}

/**
 * Check if the current user has ALL of the specified permissions.
 */
export async function hasAllPermissions(...permissionKeys: Array<string>): Promise<boolean> {
  if (permissionKeys.length === 0) return true;

  const user = await getCurrentUser();
  if (!user) return false;

  const member = await db.query.members.findFirst({
    where: eq(members.keycloakId, user.keycloakUserId),
    columns: { id: true },
  });

  if (!member) return false;

  const keys = await getMemberPermissionKeys(member.id);
  return permissionKeys.every((k) => keys.has(k));
}

/**
 * Check if the current user has ANY of the specified permissions.
 */
export async function hasAnyPermission(...permissionKeys: Array<string>): Promise<boolean> {
  if (permissionKeys.length === 0) return true;

  const user = await getCurrentUser();
  if (!user) return false;

  const member = await db.query.members.findFirst({
    where: eq(members.keycloakId, user.keycloakUserId),
    columns: { id: true },
  });

  if (!member) return false;

  const keys = await getMemberPermissionKeys(member.id);
  return permissionKeys.some((k) => keys.has(k));
}

/**
 * Check if the current user holds at least one role.
 * Roles are the unit of admin-area access, independent of their permissions.
 */
export async function hasAnyRole(): Promise<boolean> {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const member = await db.query.members.findFirst({
    where: eq(members.keycloakId, user.keycloakUserId),
    columns: { id: true },
  });

  if (!member) {
    return false;
  }

  const rows = await db
    .select({ roleId: memberRoles.roleId })
    .from(memberRoles)
    .where(eq(memberRoles.memberId, member.id))
    .limit(1);

  return rows.length > 0;
}

export async function getCurrentUserHighestRoleRank(): Promise<number | null> {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const member = await db.query.members.findFirst({
    where: eq(members.keycloakId, user.keycloakUserId),
    columns: { id: true },
  });

  if (!member) {
    return null;
  }

  const roleRanks = await db
    .select({ rank: roles.rank })
    .from(memberRoles)
    .innerJoin(roles, eq(memberRoles.roleId, roles.id))
    .where(eq(memberRoles.memberId, member.id));

  if (!roleRanks.length) {
    return null;
  }

  return Math.min(...roleRanks.map((role) => role.rank));
}

/**
 * Require a specific permission. Throws 403 if the user lacks it.
 * Use in server components and server actions.
 */
export const requirePermission = cache(async (permissionKey: string) => {
  const allowed = await hasPermission(permissionKey);

  if (!allowed) {
    forbidden();
  }
});

/**
 * Require ALL of the specified permissions. Throws 403 if the user lacks any.
 */
export const requireAllPermissions = cache(async (...permissionKeys: Array<string>) => {
  const allowed = await hasAllPermissions(...permissionKeys);

  if (!allowed) {
    forbidden();
  }
});

/**
 * Require ANY of the specified permissions. Throws 403 if the user has none.
 */
export const requireAnyPermission = cache(async (...permissionKeys: Array<string>) => {
  const allowed = await hasAnyPermission(...permissionKeys);

  if (!allowed) {
    forbidden();
  }
});

/**
 * Get the full permission set and role info for the current user.
 * Useful for rendering UI conditionally (e.g., showing/hiding buttons).
 */
export async function getCurrentUserPermissions(): Promise<{
  permissions: Array<string>;
  roles: Array<{ id: string; key: string; name: string }>;
}> {
  const user = await getCurrentUser();

  if (!user) {
    return { permissions: [], roles: [] };
  }

  const member = await db.query.members.findFirst({
    where: eq(members.keycloakId, user.keycloakUserId),
    columns: { id: true },
  });

  if (!member) {
    return { permissions: [], roles: [] };
  }

  const [permResults, roleResults] = await Promise.all([
    db
      .select({ key: permissions.key })
      .from(memberRoles)
      .innerJoin(rolePermissions, eq(memberRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(memberRoles.memberId, member.id)),
    db
      .select({
        id: roles.id,
        key: roles.key,
        name: roles.name,
      })
      .from(memberRoles)
      .innerJoin(roles, eq(memberRoles.roleId, roles.id))
      .where(eq(memberRoles.memberId, member.id)),
  ]);

  return {
    permissions: [...new Set(permResults.map((p) => p.key))],
    roles: roleResults,
  };
}
