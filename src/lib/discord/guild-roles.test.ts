import { beforeEach, describe, expect, test } from "bun:test";

import {
  DISCORD_GUILD_ROLES_CACHE_TTL_MS,
  listCachedDiscordGuildRoles,
  resetDiscordGuildRolesCacheForTests,
} from "@/lib/discord/guild-roles";

describe("listCachedDiscordGuildRoles", () => {
  beforeEach(() => {
    resetDiscordGuildRolesCacheForTests();
  });

  test("reuses loaded Discord guild roles within the TTL", async () => {
    let calls = 0;
    const loadRoles = async () => {
      calls += 1;
      return [{ color: "#2ecc71", id: "role-1", name: "Member" }];
    };

    await expect(
      listCachedDiscordGuildRoles({ loadRoles, now: 1_000 }),
    ).resolves.toEqual([{ color: "#2ecc71", id: "role-1", name: "Member" }]);
    await expect(
      listCachedDiscordGuildRoles({ loadRoles, now: 2_000 }),
    ).resolves.toEqual([{ color: "#2ecc71", id: "role-1", name: "Member" }]);

    expect(calls).toBe(1);
  });

  test("refreshes Discord guild roles after the TTL expires", async () => {
    let calls = 0;
    const loadRoles = async () => {
      calls += 1;
      return [{ id: `role-${calls}`, name: `Role ${calls}` }];
    };

    await expect(
      listCachedDiscordGuildRoles({ loadRoles, now: 1_000 }),
    ).resolves.toEqual([{ id: "role-1", name: "Role 1" }]);
    await expect(
      listCachedDiscordGuildRoles({
        loadRoles,
        now: 1_000 + DISCORD_GUILD_ROLES_CACHE_TTL_MS + 1,
      }),
    ).resolves.toEqual([{ id: "role-2", name: "Role 2" }]);

    expect(calls).toBe(2);
  });
});
