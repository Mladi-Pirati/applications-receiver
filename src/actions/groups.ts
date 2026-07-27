"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import {
  accessApplications,
  groupApplicationAccess,
  groupDiscordRoles,
  groupRoles,
  groups,
  memberApplicationAccess,
  memberGroups,
  members,
  roles,
} from "@/db/schema";
import {
  createMembersKeycloakAdminClient,
  db,
  getCurrentUser,
  getCurrentUserHighestRoleRank,
  getMemberEffectiveRoleIds,
  hasPermission,
  roleGrantsAnyPermission,
  syncMemberDiscordRolesSafely,
} from "@/lib/groups-action-dependencies";
import {
  groupApplicationIdsSchema,
  groupDiscordRolesSchema,
  groupInputSchema,
  groupRoleIdsSchema,
  memberGroupAssignmentSchema,
  type GroupInput,
} from "@/lib/validation/groups";

type ActionSuccess = { ok: true; message?: string };
type ActionFailure<TField extends string = string> = {
  ok: false;
  fieldErrors?: Partial<Record<TField, string>>;
  message: string;
};
type ActionResult<T = ActionSuccess, TField extends string = string> =
  | T
  | ActionFailure<TField>;

const CRITICAL_SELF_PERMISSIONS = [
  "members.role_management",
  "access-control.manage_roles",
];

async function requireGroupsPermission() {
  const allowed = await hasPermission("access-control.manage_groups");
  if (!allowed) {
    return {
      ok: false as const,
      message: "You are not allowed to manage groups.",
    };
  }
  return { ok: true as const };
}

async function requireMemberGroupPermission() {
  const allowed = await hasPermission("members.role_management");
  if (!allowed) {
    return {
      ok: false as const,
      message: "You are not allowed to manage member groups.",
    };
  }
  return { ok: true as const };
}

function revalidateGroups(memberId?: string) {
  revalidatePath("/admin/settings/roles");
  revalidatePath("/admin/members");
  if (memberId) revalidatePath(`/admin/members/${memberId}`);
}

async function getCurrentMemberId() {
  const user = await getCurrentUser();
  if (!user) return null;
  const member = await db.query.members.findFirst({
    columns: { id: true },
    where: eq(members.keycloakId, user.keycloakUserId),
  });
  return member?.id ?? null;
}

async function ensureRolesAllowed(roleIds: Array<string>) {
  if (!roleIds.length) return { ok: true as const };
  const [highestRank, selectedRoles] = await Promise.all([
    getCurrentUserHighestRoleRank(),
    db
      .select({ id: roles.id, rank: roles.rank })
      .from(roles)
      .where(inArray(roles.id, roleIds)),
  ]);
  if (selectedRoles.length !== roleIds.length) {
    return { ok: false as const, message: "One or more roles could not be found." };
  }
  if (highestRank === null) {
    return {
      ok: false as const,
      message: "You cannot manage groups without an active role.",
    };
  }
  if (selectedRoles.some((role) => role.rank < highestRank)) {
    return {
      ok: false as const,
      message: "You cannot manage roles above your highest role.",
    };
  }
  return { ok: true as const };
}

async function getActiveGroupApplications(groupId: string) {
  return db
    .select({
      id: accessApplications.id,
      keycloakClientId: accessApplications.keycloakClientId,
      keycloakRoleName: accessApplications.keycloakRoleName,
    })
    .from(groupApplicationAccess)
    .innerJoin(
      accessApplications,
      eq(groupApplicationAccess.applicationId, accessApplications.id),
    )
    .where(
      and(
        eq(groupApplicationAccess.groupId, groupId),
        isNull(accessApplications.archivedAt),
      ),
    );
}

async function memberHasApplicationFromAnotherSource(values: {
  applicationId: string;
  excludedGroupId: string;
  memberId: string;
}) {
  const [directRows, otherGroupRows] = await Promise.all([
    db
      .select({ applicationId: memberApplicationAccess.applicationId })
      .from(memberApplicationAccess)
      .where(
        and(
          eq(memberApplicationAccess.memberId, values.memberId),
          eq(memberApplicationAccess.applicationId, values.applicationId),
        ),
      )
      .limit(1),
    db
      .select({ applicationId: groupApplicationAccess.applicationId })
      .from(memberGroups)
      .innerJoin(
        groupApplicationAccess,
        eq(memberGroups.groupId, groupApplicationAccess.groupId),
      )
      .where(
        and(
          eq(memberGroups.memberId, values.memberId),
          eq(groupApplicationAccess.applicationId, values.applicationId),
          ne(memberGroups.groupId, values.excludedGroupId),
        ),
      )
      .limit(1),
  ]);

  return directRows.length > 0 || otherGroupRows.length > 0;
}

async function applyGroupApplicationDelta(values: {
  applications: Array<{
    id: string;
    keycloakClientId: string;
    keycloakRoleName: string;
  }>;
  groupId: string;
  member: { disabledAt: Date | null; id: string; keycloakId: string };
  mode: "add" | "remove";
}) {
  if (values.member.disabledAt) return;
  const keycloak = createMembersKeycloakAdminClient();
  for (const application of values.applications) {
    const assignment = {
      clientId: application.keycloakClientId,
      roleName: application.keycloakRoleName,
    };
    if (values.mode === "add") {
      await keycloak.addClientRole(values.member.keycloakId, assignment);
      continue;
    }
    const retained = await memberHasApplicationFromAnotherSource({
      applicationId: application.id,
      excludedGroupId: values.groupId,
      memberId: values.member.id,
    });
    if (!retained) {
      await keycloak.removeClientRole(values.member.keycloakId, assignment);
    }
  }
}

export async function createGroupAction(
  values: GroupInput,
): Promise<ActionResult<ActionSuccess & { groupId: string }, keyof GroupInput>> {
  const access = await requireGroupsPermission();
  if (!access.ok) return access;

  const parsed = groupInputSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        description: fieldErrors.description?.[0],
        name: fieldErrors.name?.[0],
      },
    };
  }

  const [group] = await db
    .insert(groups)
    .values({
      description: parsed.data.description || null,
      name: parsed.data.name,
    })
    .returning({ id: groups.id });
  if (!group) return { ok: false, message: "Unable to create the group." };

  revalidateGroups();
  return { ok: true, groupId: group.id, message: "Group created." };
}

export async function updateGroupAction(
  groupId: string,
  values: GroupInput,
): Promise<ActionResult<ActionSuccess, keyof GroupInput>> {
  const access = await requireGroupsPermission();
  if (!access.ok) return access;

  const parsed = groupInputSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        description: fieldErrors.description?.[0],
        name: fieldErrors.name?.[0],
      },
    };
  }

  await db
    .update(groups)
    .set({
      description: parsed.data.description || null,
      name: parsed.data.name,
    })
    .where(eq(groups.id, groupId));

  revalidateGroups();
  return { ok: true, message: "Group updated." };
}

export async function deleteGroupAction(groupId: string): Promise<ActionResult> {
  const access = await requireGroupsPermission();
  if (!access.ok) return access;

  const [applications, membersInGroup] = await Promise.all([
    getActiveGroupApplications(groupId),
    db
      .select({
        disabledAt: members.disabledAt,
        id: members.id,
        keycloakId: members.keycloakId,
      })
      .from(memberGroups)
      .innerJoin(members, eq(memberGroups.memberId, members.id))
      .where(eq(memberGroups.groupId, groupId)),
  ]);

  try {
    for (const member of membersInGroup) {
      await applyGroupApplicationDelta({
        applications,
        groupId,
        member,
        mode: "remove",
      });
    }
  } catch {
    return {
      ok: false,
      message: "Keycloak access could not be updated. Group was not deleted.",
    };
  }

  await db.delete(groups).where(eq(groups.id, groupId));
  for (const member of membersInGroup) {
    await syncMemberDiscordRolesSafely(member.id);
  }

  revalidateGroups();
  return { ok: true, message: "Group deleted." };
}

export async function setGroupRolesAction(
  groupId: string,
  roleIds: Array<string>,
): Promise<ActionResult> {
  const access = await requireGroupsPermission();
  if (!access.ok) return access;

  const parsed = groupRoleIdsSchema.safeParse({ roleIds });
  if (!parsed.success) return { ok: false, message: "Please choose valid roles." };
  const uniqueRoleIds = [...new Set(parsed.data.roleIds)];
  const rankAccess = await ensureRolesAllowed(uniqueRoleIds);
  if (!rankAccess.ok) return rankAccess;

  await db.transaction(async (tx) => {
    await tx.delete(groupRoles).where(eq(groupRoles.groupId, groupId));
    if (uniqueRoleIds.length) {
      await tx.insert(groupRoles).values(
        uniqueRoleIds.map((roleId) => ({
          groupId,
          roleId,
        })),
      );
    }
  });

  revalidateGroups();
  return { ok: true, message: "Group roles saved." };
}

export async function setGroupApplicationsAction(
  groupId: string,
  applicationIds: Array<string>,
): Promise<ActionResult> {
  const access = await requireGroupsPermission();
  if (!access.ok) return access;

  const parsed = groupApplicationIdsSchema.safeParse({ applicationIds });
  if (!parsed.success) {
    return { ok: false, message: "Please choose valid applications." };
  }
  const uniqueApplicationIds = [...new Set(parsed.data.applicationIds)];
  const [previousApplications, nextApplications, membersInGroup] =
    await Promise.all([
      getActiveGroupApplications(groupId),
      uniqueApplicationIds.length
        ? db
            .select({
              id: accessApplications.id,
              keycloakClientId: accessApplications.keycloakClientId,
              keycloakRoleName: accessApplications.keycloakRoleName,
            })
            .from(accessApplications)
            .where(
              and(
                inArray(accessApplications.id, uniqueApplicationIds),
                isNull(accessApplications.archivedAt),
              ),
            )
        : [],
      db
        .select({
          disabledAt: members.disabledAt,
          id: members.id,
          keycloakId: members.keycloakId,
        })
        .from(memberGroups)
        .innerJoin(members, eq(memberGroups.memberId, members.id))
        .where(eq(memberGroups.groupId, groupId)),
    ]);
  if (nextApplications.length !== uniqueApplicationIds.length) {
    return { ok: false, message: "One or more applications could not be found." };
  }

  const previousIds = new Set(previousApplications.map((app) => app.id));
  const nextIds = new Set(nextApplications.map((app) => app.id));
  const toAdd = nextApplications.filter((app) => !previousIds.has(app.id));
  const toRemove = previousApplications.filter((app) => !nextIds.has(app.id));

  try {
    for (const member of membersInGroup) {
      await applyGroupApplicationDelta({
        applications: toAdd,
        groupId,
        member,
        mode: "add",
      });
      await applyGroupApplicationDelta({
        applications: toRemove,
        groupId,
        member,
        mode: "remove",
      });
    }
  } catch {
    return {
      ok: false,
      message:
        "Keycloak access could not be updated. Group applications were not changed.",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(groupApplicationAccess)
      .where(eq(groupApplicationAccess.groupId, groupId));
    if (uniqueApplicationIds.length) {
      await tx.insert(groupApplicationAccess).values(
        uniqueApplicationIds.map((applicationId) => ({
          applicationId,
          groupId,
        })),
      );
    }
  });

  revalidateGroups();
  return { ok: true, message: "Group applications saved." };
}

export async function setGroupDiscordRolesAction(
  groupId: string,
  discordRoles: Array<{ id: string; name: string }>,
): Promise<ActionResult> {
  const access = await requireGroupsPermission();
  if (!access.ok) return access;

  const parsed = groupDiscordRolesSchema.safeParse({ discordRoles });
  if (!parsed.success) {
    return { ok: false, message: "Please choose valid Discord roles." };
  }
  const rows = [
    ...new Map(
      parsed.data.discordRoles.map((role) => [
        role.id,
        {
          discordRoleId: role.id,
          discordRoleName: role.name,
          groupId,
        },
      ]),
    ).values(),
  ];
  const membersInGroup = await db
    .select({ memberId: memberGroups.memberId })
    .from(memberGroups)
    .where(eq(memberGroups.groupId, groupId));

  await db.transaction(async (tx) => {
    await tx.delete(groupDiscordRoles).where(eq(groupDiscordRoles.groupId, groupId));
    if (rows.length) await tx.insert(groupDiscordRoles).values(rows);
  });

  for (const member of membersInGroup) {
    await syncMemberDiscordRolesSafely(member.memberId);
  }

  revalidateGroups();
  return { ok: true, message: "Group Discord roles saved." };
}

export async function setMemberGroupAssignmentAction(
  memberId: string,
  values: { assigned: boolean; groupId: string },
  options: { revalidate?: boolean } = {},
): Promise<ActionResult> {
  const access = await requireMemberGroupPermission();
  if (!access.ok) return access;

  const parsed = memberGroupAssignmentSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: "Please choose a valid group." };

  const [member, groupRoleRows, applications] = await Promise.all([
    db.query.members.findFirst({
      columns: { disabledAt: true, id: true, keycloakId: true },
      where: eq(members.id, memberId),
    }),
    db
      .select({ roleId: groupRoles.roleId })
      .from(groupRoles)
      .where(eq(groupRoles.groupId, parsed.data.groupId)),
    getActiveGroupApplications(parsed.data.groupId),
  ]);
  if (!member) return { ok: false, message: "That member could not be found." };

  const groupRoleIds = groupRoleRows.map((row) => row.roleId);
  const rankAccess = await ensureRolesAllowed(groupRoleIds);
  if (!rankAccess.ok) return rankAccess;

  const currentMemberId = await getCurrentMemberId();
  if (currentMemberId === memberId && !parsed.data.assigned) {
    const remainingRoleIds = await getMemberEffectiveRoleIds(memberId, {
      excludeGroupId: parsed.data.groupId,
    });
    const keepsCriticalAccess = await roleGrantsAnyPermission(
      remainingRoleIds,
      CRITICAL_SELF_PERMISSIONS,
    );
    if (!keepsCriticalAccess) {
      return {
        ok: false,
        message: "You cannot remove your own member management access.",
      };
    }
  }

  try {
    await applyGroupApplicationDelta({
      applications,
      groupId: parsed.data.groupId,
      member,
      mode: parsed.data.assigned ? "add" : "remove",
    });
  } catch {
    return {
      ok: false,
      message: "Keycloak access could not be updated. Group was not changed.",
    };
  }

  if (parsed.data.assigned) {
    await db
      .insert(memberGroups)
      .values({
        grantedBy: currentMemberId,
        groupId: parsed.data.groupId,
        memberId,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(memberGroups)
      .where(
        and(
          eq(memberGroups.groupId, parsed.data.groupId),
          eq(memberGroups.memberId, memberId),
        ),
      );
  }

  await syncMemberDiscordRolesSafely(memberId);
  if (options.revalidate !== false) {
    revalidateGroups(memberId);
  }
  return {
    ok: true,
    message: parsed.data.assigned ? "Group granted." : "Group removed.",
  };
}
