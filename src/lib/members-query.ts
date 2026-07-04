import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  accessApplications,
  contacts,
  memberApplicationAccess,
  memberRoles,
  members,
  memberships,
  rolePermissions,
  roles,
  permissions,
} from "@/db/schema";
import type { MembersCursorFilters, MembersListFilters } from "@/lib/members";
import {
  NO_REGION_MEMBER_FILTER,
  NO_ROLES_MEMBER_ROLE_FILTER,
  decodeCursor,
  encodeCursor,
  type MemberListSort,
} from "@/lib/members";

type ActiveRoleRow = {
  memberId: string;
  roleId: string;
  roleKey: string;
  roleName: string;
};

type MemberApplicationAccessRow = {
  applicationId: string;
  applicationName: string;
  memberId: string;
};

export function buildMembersWhere(filters: MembersListFilters | MembersCursorFilters) {
  const whereClauses = [];

  if (filters.status === "active") {
    whereClauses.push(isNull(members.disabledAt));
  } else if (filters.status === "disabled") {
    whereClauses.push(isNotNull(members.disabledAt));
  }

  if (filters.q) {
    const searchPattern = `%${filters.q}%`;
    whereClauses.push(
      or(
        sql`${members.firstName} ilike ${searchPattern}`,
        sql`${members.lastName} ilike ${searchPattern}`,
        sql`${members.username} ilike ${searchPattern}`,
        sql`${members.keycloakId} ilike ${searchPattern}`,
        sql`exists (
          select 1 from ${contacts}
          where ${contacts.memberId} = ${members.id}
          and ${contacts.type} = 'email'
          and ${contacts.value} ilike ${searchPattern}
        )`,
      ),
    );
  }

  const roleIds = filters.roleId.filter(
    (roleId) => roleId !== NO_ROLES_MEMBER_ROLE_FILTER,
  );
  const includesNoRoles = filters.roleId.includes(NO_ROLES_MEMBER_ROLE_FILTER);

  if (includesNoRoles || roleIds.length) {
    const roleClauses = [];

    if (includesNoRoles) {
      roleClauses.push(
        notExists(
          db
            .select({ value: sql`1` })
            .from(memberRoles)
            .where(
              eq(memberRoles.memberId, members.id),
            ),
        ),
      );
    }

    if (roleIds.length) {
      roleClauses.push(
        exists(
          db
            .select({ value: sql`1` })
            .from(memberRoles)
            .where(
              and(
                eq(memberRoles.memberId, members.id),
                inArray(memberRoles.roleId, roleIds),
              ),
            ),
        ),
      );
    }

    if (roleClauses.length === 1) {
      whereClauses.push(roleClauses[0]);
    } else {
      whereClauses.push(or(...roleClauses));
    }
  }

  const regions = filters.region.filter(
    (region) => region !== NO_REGION_MEMBER_FILTER,
  );
  const includesNoRegion = filters.region.includes(NO_REGION_MEMBER_FILTER);

  if (includesNoRegion || regions.length) {
    const regionClauses = [];

    if (includesNoRegion) {
      regionClauses.push(isNull(members.residenceRegion));
    }

    if (regions.length) {
      regionClauses.push(inArray(members.residenceRegion, regions));
    }

    if (regionClauses.length === 1) {
      whereClauses.push(regionClauses[0]);
    } else {
      whereClauses.push(or(...regionClauses));
    }
  }

  if (whereClauses.length === 0) return undefined;
  if (whereClauses.length === 1) return whereClauses[0];
  return and(...whereClauses);
}

export function buildMembersOrderBy(sort: MemberListSort) {
  const fullName = sql`lower(trim((${members.firstName} || ${" "} || ${members.lastName})))`;

  return [
    sort === "name-desc" ? desc(fullName) : asc(fullName),
    asc(members.username),
    asc(members.id),
  ];
}

export async function getMembersPage(filters: MembersListFilters) {
  const now = new Date();
  const where = buildMembersWhere(filters);
  const offset = (filters.page - 1) * filters.pageSize;

  const countQuery = db.select({ value: count() }).from(members);
  const [{ value: totalCount }] = await (where
    ? countQuery.where(where)
    : countQuery);

  const baseRowsQuery = db
    .select({
      disabledAt: members.disabledAt,
      firstName: members.firstName,
      id: members.id,
      keycloakId: members.keycloakId,
      lastName: members.lastName,
      residenceRegion: members.residenceRegion,
      updatedAt: members.updatedAt,
      username: members.username,
    })
    .from(members);

  const rows = await (where ? baseRowsQuery.where(where) : baseRowsQuery)
    .orderBy(...buildMembersOrderBy(filters.sort))
    .limit(filters.pageSize)
    .offset(offset);

  const memberIds = rows.map((row) => row.id);
  const contactRows = memberIds.length
    ? await db
        .select({
          isPrimary: contacts.isPrimary,
          memberId: contacts.memberId,
          sortOrder: contacts.sortOrder,
          value: contacts.value,
        })
        .from(contacts)
        .where(
          and(
            inArray(contacts.memberId, memberIds),
            eq(contacts.type, "email"),
          ),
        )
        .orderBy(desc(contacts.isPrimary), asc(contacts.sortOrder))
    : [];
  const roleRows = memberIds.length
    ? await db
        .select({
          memberId: memberRoles.memberId,
          roleId: roles.id,
          roleKey: roles.key,
          roleName: roles.name,
        })
        .from(memberRoles)
        .innerJoin(roles, eq(memberRoles.roleId, roles.id))
        .where(
          inArray(memberRoles.memberId, memberIds),
        )
        .orderBy(asc(roles.rank))
    : [];
  const applicationAccessRows = memberIds.length
    ? await db
        .select({
          applicationId: accessApplications.id,
          applicationName: accessApplications.name,
          memberId: memberApplicationAccess.memberId,
        })
        .from(memberApplicationAccess)
        .innerJoin(
          accessApplications,
          eq(memberApplicationAccess.applicationId, accessApplications.id),
        )
        .where(
          and(
            inArray(memberApplicationAccess.memberId, memberIds),
            isNull(accessApplications.archivedAt),
          ),
        )
        .orderBy(asc(accessApplications.name))
    : [];
  const membershipRows = memberIds.length
    ? await db
        .select({
          endedAt: memberships.endedAt,
          expiresAt: memberships.expiresAt,
          extendedAt: memberships.extendedAt,
          memberId: memberships.memberId,
        })
        .from(memberships)
        .where(inArray(memberships.memberId, memberIds))
        .orderBy(desc(memberships.extendedAt))
    : [];

  return {
    pageCount: Math.max(1, Math.ceil(Number(totalCount) / filters.pageSize)),
    rows: rows.map((row) => ({
      ...row,
      primaryEmail: getPrimaryEmailForMember(row.id, contactRows),
      currentMembership: (() => {
        const currentMembership = membershipRows.find(
          (membership) =>
            membership.memberId === row.id &&
            membership.endedAt === null &&
            (membership.expiresAt === null || membership.expiresAt >= now),
        );

        return currentMembership
          ? {
              expiresAt: currentMembership.expiresAt,
              extendedAt: currentMembership.extendedAt,
            }
          : null;
      })(),
      applications: getAssignedApplicationsForMember(
        row.id,
        applicationAccessRows,
      ),
      roles: getActiveRoleBadgesForMember(row.id, roleRows),
    })),
    totalCount: Number(totalCount),
  };
}

export function getActiveRoleBadgesForMember(
  memberId: string,
  roleRows: Array<ActiveRoleRow>,
) {
  return roleRows
    .filter((role) => role.memberId === memberId)
    .map((role) => ({
      id: role.roleId,
      key: role.roleKey,
      name: role.roleName,
    }));
}

export function getAssignedApplicationsForMember(
  memberId: string,
  applicationAccessRows: Array<MemberApplicationAccessRow>,
) {
  return applicationAccessRows
    .filter((application) => application.memberId === memberId)
    .map((application) => ({
      id: application.applicationId,
      name: application.applicationName,
    }));
}

export function getPrimaryEmailForMember(
  memberId: string,
  contactRows: Array<{
    isPrimary: boolean;
    memberId: string;
    sortOrder: number;
    value: string;
  }>,
) {
  return (
    contactRows
      .filter((contact) => contact.memberId === memberId)
      .sort((left, right) => {
        if (left.isPrimary !== right.isPrimary) {
          return left.isPrimary ? -1 : 1;
        }

        return left.sortOrder - right.sortOrder;
      })[0]?.value ?? null
  );
}

export async function roleGrantsAnyPermission(
  roleIds: Array<string>,
  permissionKeys: Array<string>,
) {
  if (roleIds.length === 0 || permissionKeys.length === 0) return false;

  const rows = await db
    .select({ id: roles.id })
    .from(roles)
    .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(inArray(roles.id, roleIds), inArray(permissions.key, permissionKeys)),
    )
    .limit(1);

  return rows.length > 0;
}

export async function memberHasActiveRole(memberId: string) {
  const rows = await db
    .select({ id: memberRoles.roleId })
    .from(memberRoles)
    .where(eq(memberRoles.memberId, memberId))
    .limit(1);

  return rows.length > 0;
}

const fullNameExpr = sql<string>`lower(trim((${members.firstName} || ' ' || ${members.lastName})))`;

export async function getMembersCursorPage(filters: MembersCursorFilters) {
  const baseWhere = buildMembersWhere(filters);
  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;

  let where = baseWhere;
  if (cursor) {
    const keysetClause = or(
      filters.sort === "name-asc"
        ? sql`${fullNameExpr} > ${cursor.fullName}`
        : sql`${fullNameExpr} < ${cursor.fullName}`,
      and(
        sql`${fullNameExpr} = ${cursor.fullName}`,
        gt(members.username, cursor.username),
      ),
      and(
        sql`${fullNameExpr} = ${cursor.fullName}`,
        eq(members.username, cursor.username),
        gt(members.id, cursor.id),
      ),
    );
    where = baseWhere ? and(baseWhere, keysetClause) : keysetClause;
  }

  const fetchLimit = filters.limit + 1;
  const baseRowsQuery = db
    .select({
      firstName: members.firstName,
      fullName: fullNameExpr,
      id: members.id,
      lastName: members.lastName,
      username: members.username,
    })
    .from(members);

  const allRows = await (where ? baseRowsQuery.where(where) : baseRowsQuery)
    .orderBy(...buildMembersOrderBy(filters.sort))
    .limit(fetchLimit);

  const hasMore = allRows.length > filters.limit;
  const rows = hasMore ? allRows.slice(0, filters.limit) : allRows;

  const lastRow = rows[rows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor({
          fullName: lastRow.fullName,
          id: lastRow.id,
          username: lastRow.username,
        })
      : null;

  return {
    nextCursor,
    rows: rows.map(({ fullName: _fullName, ...row }) => row),
  };
}
