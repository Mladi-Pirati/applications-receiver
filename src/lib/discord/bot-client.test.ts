import { beforeEach, describe, expect, test } from "bun:test";

import {
  createDiscordBotClient,
  DiscordBotClientError,
} from "@/lib/discord/bot-client";
import { resetSimulatedDiscordBotState } from "@/lib/discord/bot-client-simulated";

function createJsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("createDiscordBotClient", () => {
  beforeEach(() => {
    resetSimulatedDiscordBotState();
  });

  test("uses the simulated client when no bot URL is configured", async () => {
    const client = createDiscordBotClient({ baseUrl: "" });

    const roles = await client.listGuildRoles();
    const sync = await client.syncRoles({
      assignRoleIds: [roles[0]!.id],
      discordUsername: "Ana",
      removeRoleIds: [],
    });

    expect(roles.length).toBeGreaterThan(0);
    expect(sync.results).toEqual([
      { action: "assign", ok: true, roleId: roles[0]!.id },
    ]);
    expect(sync.userId).toMatch(/^\d{17,20}$/);
    expect(sync.username).toBe("Ana");
  });

  test("simulated client resolves the same user id for repeated username syncs", async () => {
    const client = createDiscordBotClient({ baseUrl: "" });

    const first = await client.syncRoles({
      assignRoleIds: ["role-1"],
      discordUsername: "Ana",
      removeRoleIds: [],
    });
    const second = await client.syncRoles({
      assignRoleIds: [],
      discordUsername: "ana ",
      removeRoleIds: ["role-1"],
    });

    expect(first.userId).toMatch(/^\d{17,20}$/);
    expect(second.userId).toBe(first.userId);
  });

  test("simulated client syncs by discord user id and reports a simulated username", async () => {
    const client = createDiscordBotClient({ baseUrl: "" });

    const sync = await client.syncRoles({
      assignRoleIds: ["role-1"],
      discordUserId: "123456789012345678",
      removeRoleIds: [],
    });

    expect(sync.userId).toBe("123456789012345678");
    expect(sync.username).toBe("simulated-user-5678");
    expect(sync.results).toEqual([
      { action: "assign", ok: true, roleId: "role-1" },
    ]);
  });

  test("simulated client records per-role user-not-found failures", async () => {
    const client = createDiscordBotClient({ baseUrl: "" });

    await expect(
      client.syncRoles({
        assignRoleIds: ["role-1"],
        discordUsername: "not.in.guild",
        removeRoleIds: ["role-2"],
      }),
    ).resolves.toEqual({
      results: [
        {
          action: "assign",
          error: "User not found in guild",
          ok: false,
          roleId: "role-1",
        },
        {
          action: "remove",
          error: "User not found in guild",
          ok: false,
          roleId: "role-2",
        },
      ],
      userId: null,
      username: null,
    });
  });

  test("simulated client resolves guild members by id and treats ids ending in 404 as missing", async () => {
    const client = createDiscordBotClient({ baseUrl: "" });

    await expect(
      client.getGuildMember("123456789012345678"),
    ).resolves.toEqual({
      displayName: null,
      userId: "123456789012345678",
      username: "simulated-user-5678",
    });
    await expect(
      client.getGuildMember("123456789012345404"),
    ).resolves.toBeNull();
  });

  test("HTTP client sends bearer-authenticated requests and parses responses", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createDiscordBotClient({
      baseUrl: "https://discord-bot.test/",
      secret: "bot-secret",
      fetch: (async (input, init) => {
        calls.push({ input, init });
        if (String(input).endsWith("/api/guild/roles")) {
          return createJsonResponse({
            roles: [{ color: "#2ecc71", id: "role-1", name: "Member" }],
          });
        }
        return createJsonResponse({
          results: [{ action: "assign", ok: true, roleId: "role-1" }],
          userId: "123456789012345678",
          username: "ana",
        });
      }) as typeof fetch,
    });

    await expect(client.listGuildRoles()).resolves.toEqual([
      { color: "#2ecc71", id: "role-1", name: "Member" },
    ]);
    await expect(
      client.syncRoles({
        assignRoleIds: ["role-1"],
        discordUsername: "Ana",
        removeRoleIds: [],
      }),
    ).resolves.toEqual({
      results: [{ action: "assign", ok: true, roleId: "role-1" }],
      userId: "123456789012345678",
      username: "ana",
    });

    expect(calls.map((call) => String(call.input))).toEqual([
      "https://discord-bot.test/api/guild/roles",
      "https://discord-bot.test/api/role-sync",
    ]);
    expect(calls[0]?.init?.headers).toEqual({
      Authorization: "Bearer bot-secret",
    });
    expect(calls[1]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      assignRoleIds: ["role-1"],
      discordUsername: "Ana",
      removeRoleIds: [],
    });
  });

  test("HTTP client sends the discord user id when provided", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createDiscordBotClient({
      baseUrl: "https://discord-bot.test",
      secret: "bot-secret",
      fetch: (async (input, init) => {
        calls.push({ input, init });
        return createJsonResponse({
          results: [{ action: "assign", ok: true, roleId: "role-1" }],
          userId: "123456789012345678",
          username: "ana",
        });
      }) as typeof fetch,
    });

    await client.syncRoles({
      assignRoleIds: ["role-1"],
      discordUserId: "123456789012345678",
      removeRoleIds: [],
    });

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      assignRoleIds: ["role-1"],
      discordUserId: "123456789012345678",
      removeRoleIds: [],
    });
  });

  test("HTTP client tolerates role-sync responses without a username field", async () => {
    const client = createDiscordBotClient({
      baseUrl: "https://discord-bot.test",
      secret: "bot-secret",
      fetch: (async (..._args: Parameters<typeof fetch>) =>
        createJsonResponse({
          results: [{ action: "assign", ok: true, roleId: "role-1" }],
          userId: "123456789012345678",
        })) as typeof fetch,
    });

    await expect(
      client.syncRoles({
        assignRoleIds: ["role-1"],
        discordUsername: "Ana",
        removeRoleIds: [],
      }),
    ).resolves.toEqual({
      results: [{ action: "assign", ok: true, roleId: "role-1" }],
      userId: "123456789012345678",
      username: null,
    });
  });

  test("HTTP client skips empty sync diffs without calling the bot", async () => {
    const calls: Array<unknown> = [];
    const client = createDiscordBotClient({
      baseUrl: "https://discord-bot.test",
      secret: "bot-secret",
      fetch: (async (...args) => {
        calls.push(args);
        return createJsonResponse({ results: [], userId: null });
      }) as typeof fetch,
    });

    await expect(
      client.syncRoles({
        assignRoleIds: [],
        discordUsername: "Ana",
        removeRoleIds: [],
      }),
    ).resolves.toEqual({ results: [], userId: null, username: null });
    expect(calls).toEqual([]);
  });

  test("HTTP client fetches guild members by id", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createDiscordBotClient({
      baseUrl: "https://discord-bot.test",
      secret: "bot-secret",
      fetch: (async (input, init) => {
        calls.push({ input, init });
        return createJsonResponse({
          found: true,
          member: {
            displayName: "Ana Banana",
            userId: "123456789012345678",
            username: "ana",
          },
        });
      }) as typeof fetch,
    });

    await expect(
      client.getGuildMember("123456789012345678"),
    ).resolves.toEqual({
      displayName: "Ana Banana",
      userId: "123456789012345678",
      username: "ana",
    });
    expect(String(calls[0]?.input)).toBe(
      "https://discord-bot.test/api/guild/members/123456789012345678",
    );
    expect(calls[0]?.init?.headers).toEqual({
      Authorization: "Bearer bot-secret",
    });
  });

  test("HTTP client returns null for guild members that are not found", async () => {
    const client = createDiscordBotClient({
      baseUrl: "https://discord-bot.test",
      secret: "bot-secret",
      fetch: (async (..._args: Parameters<typeof fetch>) =>
        createJsonResponse({ found: false })) as typeof fetch,
    });

    await expect(
      client.getGuildMember("123456789012345678"),
    ).resolves.toBeNull();
  });

  test("HTTP client throws a typed error on non-2xx responses", async () => {
    const client = createDiscordBotClient({
      baseUrl: "https://discord-bot.test",
      secret: "bot-secret",
      fetch: (async (..._args: Parameters<typeof fetch>) =>
        new Response("nope", {
          status: 503,
          statusText: "Service Unavailable",
        })) as typeof fetch,
    });

    await expect(client.listGuildRoles()).rejects.toBeInstanceOf(
      DiscordBotClientError,
    );
  });
});
