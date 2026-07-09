import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  contacts,
  groupDiscordRoles,
  memberDiscordRoles,
  memberDiscordRoleSyncs,
  memberGroups,
  members,
  memberships,
  type DiscordRoleSyncStatus,
} from "@/db/schema";
import {
  createDiscordBotClient,
  type DiscordBotClient,
  type DiscordRoleSyncResult,
} from "@/lib/discord/bot-client";
import { upsertDiscordContact } from "@/lib/member-contacts";

export type DesiredDiscordRole = {
  id: string;
  name: string;
};

export type CurrentDiscordRoleSync = {
  discordRoleId: string;
  discordRoleName: string;
  errorMessage: string | null;
  status: DiscordRoleSyncStatus;
};

export type MemberDiscordRoleSyncContext = {
  currentSyncs: Array<CurrentDiscordRoleSync>;
  desiredRoles: Array<DesiredDiscordRole>;
  disabledAt: Date | null;
  discordUserId: string | null;
  discordUsername: string | null;
  hasActiveMembership: boolean;
};

export type MemberDiscordIdentity = {
  discordUserId: string;
  username: string | null;
};

export type MemberDiscordRoleSyncUpsert = {
  discordRoleId: string;
  discordRoleName: string;
  errorMessage: string | null;
  status: DiscordRoleSyncStatus;
  syncedAt: Date;
};

export type MemberDiscordRoleSyncRepository = {
  getMemberDiscordRoleSyncContext(
    memberId: string,
  ): Promise<MemberDiscordRoleSyncContext | null>;
  upsertMemberDiscordRoleSyncs(
    memberId: string,
    rows: Array<MemberDiscordRoleSyncUpsert>,
  ): Promise<void>;
  saveDiscordIdentity(
    memberId: string,
    identity: MemberDiscordIdentity,
  ): Promise<void>;
};

export type MemberDiscordRoleSyncStatus = "skipped" | "noop" | "synced";

export type MemberDiscordRoleSyncSummary = {
  status: MemberDiscordRoleSyncStatus;
  results: Array<DiscordRoleSyncResult>;
};

function dedupeDesiredRoles(roles: Array<DesiredDiscordRole>) {
  const byId = new Map<string, DesiredDiscordRole>();
  for (const role of roles) {
    if (!byId.has(role.id)) byId.set(role.id, role);
  }
  return [...byId.values()];
}

function createDefaultMemberDiscordRoleSyncRepository(): MemberDiscordRoleSyncRepository {
  return {
    async getMemberDiscordRoleSyncContext(memberId) {
      const member = await db.query.members.findFirst({
        columns: { disabledAt: true, discordUserId: true, id: true },
        where: eq(members.id, memberId),
      });
      if (!member) return null;

      const now = new Date();
      const [discordContact, directRoles, groupRoles, currentSyncRows, activeMemberships] =
        await Promise.all([
          db.query.contacts.findFirst({
            columns: { value: true },
            where: and(eq(contacts.memberId, memberId), eq(contacts.type, "discord")),
          }),
          db
            .select({
              id: memberDiscordRoles.discordRoleId,
              name: memberDiscordRoles.discordRoleName,
            })
            .from(memberDiscordRoles)
            .where(eq(memberDiscordRoles.memberId, memberId)),
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
            .where(eq(memberGroups.memberId, memberId)),
          db
            .select({
              discordRoleId: memberDiscordRoleSyncs.discordRoleId,
              discordRoleName: memberDiscordRoleSyncs.discordRoleName,
              errorMessage: memberDiscordRoleSyncs.errorMessage,
              status: memberDiscordRoleSyncs.status,
            })
            .from(memberDiscordRoleSyncs)
            .where(eq(memberDiscordRoleSyncs.memberId, memberId)),
          db
            .select({ id: memberships.id })
            .from(memberships)
            .where(
              and(
                eq(memberships.memberId, memberId),
                isNull(memberships.endedAt),
                or(isNull(memberships.expiresAt), gt(memberships.expiresAt, now)),
              ),
            )
            .limit(1),
        ]);

      return {
        currentSyncs: currentSyncRows,
        desiredRoles: dedupeDesiredRoles([...directRoles, ...groupRoles]),
        disabledAt: member.disabledAt,
        discordUserId: member.discordUserId,
        discordUsername: discordContact?.value ?? null,
        hasActiveMembership: activeMemberships.length > 0,
      };
    },
    async upsertMemberDiscordRoleSyncs(memberId, rows) {
      if (!rows.length) return;
      await db
        .insert(memberDiscordRoleSyncs)
        .values(rows.map((row) => ({ ...row, memberId })))
        .onConflictDoUpdate({
          target: [
            memberDiscordRoleSyncs.memberId,
            memberDiscordRoleSyncs.discordRoleId,
          ],
          set: {
            discordRoleName: sqlExcluded(memberDiscordRoleSyncs.discordRoleName),
            errorMessage: sqlExcluded(memberDiscordRoleSyncs.errorMessage),
            status: sqlExcluded(memberDiscordRoleSyncs.status),
            syncedAt: sqlExcluded(memberDiscordRoleSyncs.syncedAt),
          },
        });
    },
    async saveDiscordIdentity(memberId, identity) {
      try {
        await db
          .update(members)
          .set({ discordUserId: identity.discordUserId })
          .where(
            and(eq(members.id, memberId), isNull(members.discordUserId)),
          );
      } catch (error) {
        // A unique violation means another member already claimed this
        // Discord account; keep the sync result and surface it in logs only.
        console.error("[discord-role-sync]", {
          discordUserId: identity.discordUserId,
          errorMessage: error instanceof Error ? error.message : String(error),
          memberId,
          message: "Failed to save captured Discord user id.",
        });
        return;
      }

      const username = identity.username?.trim();
      if (!username) return;

      await upsertDiscordContact(memberId, username, db);
    },
  };
}

function sqlExcluded<T>(column: T) {
  return sql.raw(`excluded.${(column as { name: string }).name}`);
}

function indexCurrentSyncs(syncs: Array<CurrentDiscordRoleSync>) {
  return new Map(syncs.map((sync) => [sync.discordRoleId, sync]));
}

function buildSyncIdentifier(context: MemberDiscordRoleSyncContext) {
  if (context.discordUserId) {
    return { discordUserId: context.discordUserId };
  }
  const username = context.discordUsername?.trim();
  return username ? { discordUsername: username } : null;
}

function getRoleNameForResult(
  result: DiscordRoleSyncResult,
  desiredById: Map<string, DesiredDiscordRole>,
  currentById: Map<string, CurrentDiscordRoleSync>,
) {
  return (
    desiredById.get(result.roleId)?.name ??
    currentById.get(result.roleId)?.discordRoleName ??
    result.roleId
  );
}

export async function syncMemberDiscordRoles(
  memberId: string,
  deps: {
    botClient?: DiscordBotClient;
    now?: () => Date;
    repository?: MemberDiscordRoleSyncRepository;
  } = {},
): Promise<MemberDiscordRoleSyncSummary> {
  const repository =
    deps.repository ?? createDefaultMemberDiscordRoleSyncRepository();
  const context = await repository.getMemberDiscordRoleSyncContext(memberId);
  const identifier = context ? buildSyncIdentifier(context) : null;
  if (!context || !identifier) {
    return { results: [], status: "skipped" };
  }

  const effectiveDesiredRoles = context.disabledAt
    ? []
    : dedupeDesiredRoles(context.desiredRoles);
  const desiredById = new Map(effectiveDesiredRoles.map((role) => [role.id, role]));
  const currentById = indexCurrentSyncs(context.currentSyncs);

  const assignRoleIds = effectiveDesiredRoles
    .filter((role) => {
      const current = currentById.get(role.id);
      return (
        !current || current.status === "failed" || current.status === "removed"
      );
    })
    .map((role) => role.id);
  const removeRoleIds = context.currentSyncs
    .filter(
      (sync) =>
        !desiredById.has(sync.discordRoleId) &&
        (sync.status === "assigned" || sync.status === "failed"),
    )
    .map((sync) => sync.discordRoleId);

  if (!assignRoleIds.length && !removeRoleIds.length) {
    return { results: [], status: "noop" };
  }

  const botClient = deps.botClient ?? createDiscordBotClient();
  const response = await botClient.syncRoles({
    assignRoleIds,
    ...identifier,
    removeRoleIds,
  });
  const syncedAt = deps.now?.() ?? new Date();

  await repository.upsertMemberDiscordRoleSyncs(
    memberId,
    response.results.map((result) => ({
      discordRoleId: result.roleId,
      discordRoleName: getRoleNameForResult(result, desiredById, currentById),
      errorMessage: result.ok ? null : (result.error ?? "Discord sync failed"),
      status: result.ok
        ? result.action === "assign"
          ? "assigned"
          : "removed"
        : "failed",
      syncedAt,
    })),
  );

  if (response.userId) {
    await repository.saveDiscordIdentity(memberId, {
      discordUserId: response.userId,
      username: response.username,
    });
  }

  return { results: response.results, status: "synced" };
}

export async function syncMemberDiscordRolesSafely(
  memberId: string,
  deps: Parameters<typeof syncMemberDiscordRoles>[1] = {},
) {
  try {
    return await syncMemberDiscordRoles(memberId, deps);
  } catch (error) {
    console.error("[discord-role-sync]", {
      errorMessage: error instanceof Error ? error.message : String(error),
      memberId,
      message: "Discord role sync failed.",
    });
    return { results: [], status: "skipped" as const };
  }
}

export async function removeAllMemberDiscordRolesSafely(
  memberId: string,
  deps: {
    botClient?: DiscordBotClient;
    repository?: MemberDiscordRoleSyncRepository;
  } = {},
) {
  const repository =
    deps.repository ?? createDefaultMemberDiscordRoleSyncRepository();
  const context = await repository.getMemberDiscordRoleSyncContext(memberId);
  const identifier = context ? buildSyncIdentifier(context) : null;
  if (!context || !identifier) return;

  const removeRoleIds = context.currentSyncs
    .filter((sync) => sync.status === "assigned" || sync.status === "failed")
    .map((sync) => sync.discordRoleId);
  if (!removeRoleIds.length) return;

  try {
    const botClient = deps.botClient ?? createDiscordBotClient();
    const response = await botClient.syncRoles({
      assignRoleIds: [],
      ...identifier,
      removeRoleIds,
    });
    const currentById = indexCurrentSyncs(context.currentSyncs);
    await repository.upsertMemberDiscordRoleSyncs(
      memberId,
      response.results.map((result) => ({
        discordRoleId: result.roleId,
        discordRoleName:
          currentById.get(result.roleId)?.discordRoleName ?? result.roleId,
        errorMessage: result.ok ? null : (result.error ?? "Discord sync failed"),
        status: result.ok ? "removed" : "failed",
        syncedAt: new Date(),
      })),
    );
  } catch (error) {
    console.error("[discord-role-sync]", {
      errorMessage: error instanceof Error ? error.message : String(error),
      memberId,
      message: "Discord role removal failed.",
    });
  }
}
