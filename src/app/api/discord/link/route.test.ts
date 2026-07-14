import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

import { discordLinkTokens, members } from "@/db/schema";

// --- mock state ---

type TokenRow = {
  id: string;
  memberId: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
};

type MemberRow = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  discordUserId: string | null;
};

let tokenRow: TokenRow | null = null;
let memberRow: MemberRow | null = null;
let existingMemberWithDiscord: MemberRow | null = null;
let memberUpdateCalls: Array<{ discordUserId: string | null }> = [];
let contactUpsertCalls: Array<{
  memberId: string;
  username: string;
}> = [];

function createDbExecutor() {
  return {
    query: {
      discordLinkTokens: {
        async findFirst() {
          return tokenRow ?? undefined;
        },
      },
      members: {
        async findFirst(options?: { columns?: Record<string, boolean> }) {
          // The conflict check selects only the id; the final payload
          // select includes username.
          if (!options?.columns?.username) {
            return existingMemberWithDiscord ?? undefined;
          }
          return memberRow ?? undefined;
        },
      },
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where() {
              if (table === members) {
                memberUpdateCalls.push({
                  discordUserId: values.discordUserId as string | null,
                });
              }
              return {
                async returning() {
                  if (table !== discordLinkTokens) return [];
                  if (!tokenRow || tokenRow.usedAt !== null) return [];
                  tokenRow.usedAt = values.usedAt as Date;
                  return [{ id: tokenRow.id }];
                },
                then(resolve: (value: undefined) => void) {
                  resolve(undefined);
                },
              };
            },
          };
        },
      };
    },
  };
}

const dbExecutor = createDbExecutor();
const db = {
  ...dbExecutor,
  async transaction(fn: (tx: typeof dbExecutor) => Promise<unknown>) {
    return fn(dbExecutor);
  },
};

async function upsertDiscordContact(memberId: string, username: string) {
  contactUpsertCalls.push({ memberId, username });
}

let roleSyncCalls: Array<string> = [];

async function syncMemberDiscordRolesSafely(memberId: string) {
  roleSyncCalls.push(memberId);
  return { results: [], status: "noop" as const };
}

// --- mocks ---

mock.module("@/db", () => ({ db }));
mock.module("@/lib/member-contacts", () => ({ upsertDiscordContact }));
mock.module("@/lib/discord/role-sync", () => ({
  syncMemberDiscordRolesSafely,
}));

const routeModulePromise = import("./route");

function createRequest(
  authHeader?: string,
  body?: Record<string, unknown>,
  origin?: string,
) {
  const url = new URL("https://example.com/api/discord/link");
  return new NextRequest(url.toString(), {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
  });
}

beforeEach(() => {
  tokenRow = null;
  memberRow = null;
  existingMemberWithDiscord = null;
  memberUpdateCalls = [];
  contactUpsertCalls = [];
  roleSyncCalls = [];
  process.env.DISCORD_LINK_API_SECRET = "test-secret";
});

afterAll(() => {
  mock.restore();
  delete process.env.DISCORD_LINK_API_SECRET;
});

describe("POST /api/discord/link", () => {
  test("returns 503 when env var not configured", async () => {
    delete process.env.DISCORD_LINK_API_SECRET;
    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest("Bearer test-secret", {
        token: "ABC12345",
        discordUserId: "123",
        discordUsername: "user",
      }),
    );

    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.error).toBe("not_configured");
  });

  test("returns 401 when Authorization header is missing", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest(undefined, {
        token: "ABC12345",
        discordUserId: "123",
        discordUsername: "user",
      }),
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe("unauthorized");
  });

  test("returns 401 when bearer secret is wrong", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest("Bearer wrong-secret", {
        token: "ABC12345",
        discordUserId: "123",
        discordUsername: "user",
      }),
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe("unauthorized");
  });

  test("returns 400 for invalid request body", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest("Bearer test-secret", { token: "", discordUserId: "123" }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("invalid_request");
  });

  test("returns 404 when token not found", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest("Bearer test-secret", {
        token: "ABC12345",
        discordUserId: "123",
        discordUsername: "user",
      }),
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe("unknown_token");
  });

  test("returns 410 when token is expired", async () => {
    const pastDate = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
    tokenRow = {
      id: "token-1",
      memberId: "member-1",
      token: "ABC12345",
      expiresAt: pastDate,
      usedAt: null,
    };

    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest("Bearer test-secret", {
        token: "abc12345",
        discordUserId: "123",
        discordUsername: "user",
      }),
    );

    expect(response.status).toBe(410);
    const json = await response.json();
    expect(json.error).toBe("token_expired");
  });

  test("returns 410 when token is already used", async () => {
    tokenRow = {
      id: "token-1",
      memberId: "member-1",
      token: "ABC12345",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: new Date(),
    };

    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest("Bearer test-secret", {
        token: "ABC12345",
        discordUserId: "123",
        discordUsername: "user",
      }),
    );

    expect(response.status).toBe(410);
    const json = await response.json();
    expect(json.error).toBe("token_expired");
  });

  test("returns 409 when discordUserId is linked to another member", async () => {
    tokenRow = {
      id: "token-1",
      memberId: "member-1",
      token: "ABC12345",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    };
    memberRow = {
      id: "member-1",
      username: "alice",
      firstName: "Alice",
      lastName: "Smith",
      discordUserId: null,
    };
    existingMemberWithDiscord = {
      id: "member-2",
      username: "bob",
      firstName: "Bob",
      lastName: "Jones",
      discordUserId: "123",
    };

    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest("Bearer test-secret", {
        token: "ABC12345",
        discordUserId: "123",
        discordUsername: "user",
      }),
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toBe("already_linked");
    expect(roleSyncCalls).toEqual([]);
  });

  test("returns 200 on successful link with correct member payload", async () => {
    tokenRow = {
      id: "token-1",
      memberId: "member-1",
      token: "ABC12345",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    };
    memberRow = {
      id: "member-1",
      username: "alice",
      firstName: "Alice",
      lastName: "Smith",
      discordUserId: "123",
    };

    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest("Bearer test-secret", {
        token: "ABC12345",
        discordUserId: "123",
        discordUsername: "user",
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.member).toEqual({
      id: "member-1",
      username: "alice",
      firstName: "Alice",
      lastName: "Smith",
      discordUserId: "123",
    });

    // Verify contact was upserted
    expect(contactUpsertCalls.length).toBe(1);
    expect(contactUpsertCalls[0]).toEqual({
      memberId: "member-1",
      username: "user",
    });

    // Verify the token was consumed and the member row updated
    expect(tokenRow?.usedAt).not.toBeNull();
    expect(memberUpdateCalls).toEqual([{ discordUserId: "123" }]);

    // Roles are synced after a successful link
    expect(roleSyncCalls).toEqual(["member-1"]);
  });

  test("normalizes token to uppercase", async () => {
    tokenRow = {
      id: "token-1",
      memberId: "member-1",
      token: "ABC12345",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    };
    memberRow = {
      id: "member-1",
      username: "alice",
      firstName: "Alice",
      lastName: "Smith",
      discordUserId: "123",
    };

    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest("Bearer test-secret", {
        token: "  abc12345  ",
        discordUserId: "123",
        discordUsername: "user",
      }),
    );

    expect(response.status).toBe(200);
  });

  test("includes Cache-Control: no-store header", async () => {
    tokenRow = {
      id: "token-1",
      memberId: "member-1",
      token: "ABC12345",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    };
    memberRow = {
      id: "member-1",
      username: "alice",
      firstName: "Alice",
      lastName: "Smith",
      discordUserId: "123",
    };

    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest("Bearer test-secret", {
        token: "ABC12345",
        discordUserId: "123",
        discordUsername: "user",
      }),
    );

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
