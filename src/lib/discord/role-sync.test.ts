import { describe, expect, test } from "bun:test";

import {
  syncMemberDiscordRoles,
  type MemberDiscordRoleSyncRepository,
} from "@/lib/discord/role-sync";
import type {
  DiscordBotClient,
  DiscordRoleSyncRequest,
  DiscordRoleSyncResponse,
} from "@/lib/discord/bot-client";

function createRepository(
  context: Awaited<
    ReturnType<MemberDiscordRoleSyncRepository["getMemberDiscordRoleSyncContext"]>
  >,
) {
  const upserts: Array<
    Parameters<MemberDiscordRoleSyncRepository["upsertMemberDiscordRoleSyncs"]>[1]
  > = [];
  const identitySaves: Array<
    Parameters<MemberDiscordRoleSyncRepository["saveDiscordIdentity"]>[1]
  > = [];
  const repository: MemberDiscordRoleSyncRepository = {
    async getMemberDiscordRoleSyncContext() {
      return context;
    },
    async upsertMemberDiscordRoleSyncs(_memberId, rows) {
      upserts.push(rows);
    },
    async saveDiscordIdentity(_memberId, identity) {
      identitySaves.push(identity);
    },
  };
  return { identitySaves, repository, upserts };
}

function createBotClient(
  handler: (request: DiscordRoleSyncRequest) => DiscordRoleSyncResponse,
) {
  const requests: Array<DiscordRoleSyncRequest> = [];
  const botClient: DiscordBotClient = {
    async listGuildRoles() {
      return [];
    },
    async syncRoles(request) {
      requests.push(request);
      return handler(request);
    },
    async getGuildMember() {
      return null;
    },
  };
  return { botClient, requests };
}

describe("syncMemberDiscordRoles", () => {
  test("skips members without a Discord user id or username", async () => {
    const { repository, upserts } = createRepository({
      currentSyncs: [],
      desiredRoles: [{ id: "role-1", name: "Member" }],
      disabledAt: null,
      discordUserId: null,
      discordUsername: null,
      hasActiveMembership: true,
    });
    const { botClient, requests } = createBotClient(() => ({
      results: [],
      userId: null,
      username: null,
    }));

    await expect(
      syncMemberDiscordRoles("member-1", { botClient, repository }),
    ).resolves.toEqual({ results: [], status: "skipped" });
    expect(requests).toEqual([]);
    expect(upserts).toEqual([]);
  });

  test("assigns desired roles that have never synced", async () => {
    const { repository, upserts } = createRepository({
      currentSyncs: [],
      desiredRoles: [
        { id: "role-1", name: "Member" },
        { id: "role-2", name: "Board" },
      ],
      disabledAt: null,
      discordUserId: null,
      discordUsername: "Ana",
      hasActiveMembership: true,
    });
    const { botClient, requests } = createBotClient((request) => ({
      results: request.assignRoleIds.map((roleId) => ({
        action: "assign",
        ok: true,
        roleId,
      })),
      userId: "123456789012345678",
      username: "ana",
    }));
    const now = new Date("2026-07-09T10:00:00.000Z");

    await expect(
      syncMemberDiscordRoles("member-1", {
        botClient,
        now: () => now,
        repository,
      }),
    ).resolves.toMatchObject({ status: "synced" });

    expect(requests).toEqual([
      {
        assignRoleIds: ["role-1", "role-2"],
        discordUsername: "Ana",
        removeRoleIds: [],
      },
    ]);
    expect(upserts).toEqual([
      [
        {
          discordRoleId: "role-1",
          discordRoleName: "Member",
          errorMessage: null,
          status: "assigned",
          syncedAt: now,
        },
        {
          discordRoleId: "role-2",
          discordRoleName: "Board",
          errorMessage: null,
          status: "assigned",
          syncedAt: now,
        },
      ],
    ]);
  });

  test("captures the resolved discord identity after a username-based sync", async () => {
    const { identitySaves, repository } = createRepository({
      currentSyncs: [],
      desiredRoles: [{ id: "role-1", name: "Member" }],
      disabledAt: null,
      discordUserId: null,
      discordUsername: "Ana",
      hasActiveMembership: true,
    });
    const { botClient } = createBotClient((request) => ({
      results: request.assignRoleIds.map((roleId) => ({
        action: "assign",
        ok: true,
        roleId,
      })),
      userId: "123456789012345678",
      username: "ana",
    }));

    await syncMemberDiscordRoles("member-1", { botClient, repository });

    expect(identitySaves).toEqual([
      { discordUserId: "123456789012345678", username: "ana" },
    ]);
  });

  test("prefers the stored discord user id over the username", async () => {
    const { identitySaves, repository } = createRepository({
      currentSyncs: [],
      desiredRoles: [{ id: "role-1", name: "Member" }],
      disabledAt: null,
      discordUserId: "123456789012345678",
      discordUsername: "stale-name",
      hasActiveMembership: true,
    });
    const { botClient, requests } = createBotClient((request) => ({
      results: request.assignRoleIds.map((roleId) => ({
        action: "assign",
        ok: true,
        roleId,
      })),
      userId: "123456789012345678",
      username: "fresh-name",
    }));

    await syncMemberDiscordRoles("member-1", { botClient, repository });

    expect(requests).toEqual([
      {
        assignRoleIds: ["role-1"],
        discordUserId: "123456789012345678",
        removeRoleIds: [],
      },
    ]);
    expect(identitySaves).toEqual([
      { discordUserId: "123456789012345678", username: "fresh-name" },
    ]);
  });

  test("syncs by id even when no username is on file", async () => {
    const { repository } = createRepository({
      currentSyncs: [],
      desiredRoles: [{ id: "role-1", name: "Member" }],
      disabledAt: null,
      discordUserId: "123456789012345678",
      discordUsername: null,
      hasActiveMembership: true,
    });
    const { botClient, requests } = createBotClient((request) => ({
      results: request.assignRoleIds.map((roleId) => ({
        action: "assign",
        ok: true,
        roleId,
      })),
      userId: "123456789012345678",
      username: "ana",
    }));

    await expect(
      syncMemberDiscordRoles("member-1", { botClient, repository }),
    ).resolves.toMatchObject({ status: "synced" });

    expect(requests).toEqual([
      {
        assignRoleIds: ["role-1"],
        discordUserId: "123456789012345678",
        removeRoleIds: [],
      },
    ]);
  });

  test("assigns desired group roles even when the member has no active membership", async () => {
    const { repository } = createRepository({
      currentSyncs: [],
      desiredRoles: [{ id: "role-1", name: "Member" }],
      disabledAt: null,
      discordUserId: "123456789012345678",
      discordUsername: null,
      hasActiveMembership: false,
    });
    const { botClient, requests } = createBotClient((request) => ({
      results: request.assignRoleIds.map((roleId) => ({
        action: "assign",
        ok: true,
        roleId,
      })),
      userId: "123456789012345678",
      username: "ana",
    }));

    await expect(
      syncMemberDiscordRoles("member-1", { botClient, repository }),
    ).resolves.toMatchObject({ status: "synced" });

    expect(requests).toEqual([
      {
        assignRoleIds: ["role-1"],
        discordUserId: "123456789012345678",
        removeRoleIds: [],
      },
    ]);
  });

  test("does not save an identity when the bot cannot resolve the member", async () => {
    const { identitySaves, repository, upserts } = createRepository({
      currentSyncs: [],
      desiredRoles: [{ id: "role-1", name: "Member" }],
      disabledAt: null,
      discordUserId: null,
      discordUsername: "not.in.guild",
      hasActiveMembership: true,
    });
    const { botClient } = createBotClient((request) => ({
      results: request.assignRoleIds.map((roleId) => ({
        action: "assign",
        error: "User not found in guild",
        ok: false,
        roleId,
      })),
      userId: null,
      username: null,
    }));

    await syncMemberDiscordRoles("member-1", { botClient, repository });

    expect(identitySaves).toEqual([]);
    expect(upserts[0]).toMatchObject([
      {
        discordRoleId: "role-1",
        errorMessage: "User not found in guild",
        status: "failed",
      },
    ]);
  });

  test("removes previously synced roles when the member is disabled", async () => {
    const { repository, upserts } = createRepository({
      currentSyncs: [
        {
          discordRoleId: "role-1",
          discordRoleName: "Member",
          errorMessage: null,
          status: "assigned",
        },
      ],
      desiredRoles: [{ id: "role-1", name: "Member" }],
      disabledAt: new Date("2026-07-09T08:00:00.000Z"),
      discordUserId: null,
      discordUsername: "Ana",
      hasActiveMembership: true,
    });
    const { botClient, requests } = createBotClient((request) => ({
      results: request.removeRoleIds.map((roleId) => ({
        action: "remove",
        ok: true,
        roleId,
      })),
      userId: "123456789012345678",
      username: "ana",
    }));

    await syncMemberDiscordRoles("member-1", { botClient, repository });

    expect(requests).toEqual([
      {
        assignRoleIds: [],
        discordUsername: "Ana",
        removeRoleIds: ["role-1"],
      },
    ]);
    expect(upserts[0]).toMatchObject([
      {
        discordRoleId: "role-1",
        discordRoleName: "Member",
        errorMessage: null,
        status: "removed",
      },
    ]);
  });

  test("keeps roles that are still desired from another source", async () => {
    const { repository, upserts } = createRepository({
      currentSyncs: [
        {
          discordRoleId: "role-1",
          discordRoleName: "Member",
          errorMessage: null,
          status: "assigned",
        },
      ],
      desiredRoles: [{ id: "role-1", name: "Member" }],
      disabledAt: null,
      discordUserId: null,
      discordUsername: "Ana",
      hasActiveMembership: true,
    });
    const { botClient, requests } = createBotClient(() => ({
      results: [],
      userId: null,
      username: null,
    }));

    await expect(
      syncMemberDiscordRoles("member-1", { botClient, repository }),
    ).resolves.toEqual({ results: [], status: "noop" });
    expect(requests).toEqual([]);
    expect(upserts).toEqual([]);
  });
});
