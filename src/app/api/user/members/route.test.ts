import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { NextRequest } from "next/server";

import type { JWTPayload } from "jose";

import { encodeCursor } from "@/lib/members";

// --- mock state ---

let verifyResult: JWTPayload | Error = { sub: "keycloak-user-123" };

let getMembersCursorPageResult: {
  rows: Array<{
    id: string;
    firstName: string;
    lastName: string;
    username: string;
  }>;
  nextCursor: string | null;
} = {
  rows: [
    { id: "member-1", firstName: "Ada", lastName: "Lovelace", username: "ada" },
  ],
  nextCursor: null,
};

// --- mocks ---

async function verifyKeycloakAccessToken(_token: string): Promise<JWTPayload> {
  if (verifyResult instanceof Error) throw verifyResult;
  return verifyResult;
}

mock.module("@/lib/auth/keycloak-jwks", () => ({ verifyKeycloakAccessToken }));
mock.module("@/lib/members-query", () => ({
  getMembersCursorPage: async (_filters: unknown) => getMembersCursorPageResult,
}));

const routeModulePromise = import("./route");

function createRequest(
  authHeader?: string,
  searchParams: Record<string, string> = {},
  origin?: string,
) {
  const url = new URL("https://example.com/api/user/members");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), {
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
  });
}

beforeEach(() => {
  verifyResult = { sub: "keycloak-user-123" };
  getMembersCursorPageResult = {
    rows: [
      { id: "member-1", firstName: "Ada", lastName: "Lovelace", username: "ada" },
    ],
    nextCursor: null,
  };
});

afterAll(() => {
  mock.restore();
});

describe("GET /api/user/members", () => {
  test("returns 401 when Authorization header is missing", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="helm"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("returns 401 when Authorization header is not Bearer format", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest("Basic dXNlcjpwYXNz"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="helm"');
  });

  test("returns 401 when token verification fails", async () => {
    const { GET } = await routeModulePromise;
    verifyResult = new Error("JWTExpired");
    const response = await GET(createRequest("Bearer expired.token.here"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid token." });
    expect(response.headers.get("WWW-Authenticate")).toContain("invalid_token");
  });

  test("returns 200 with rows and null nextCursor on last page", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest("Bearer valid.token.here"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();
    expect(body.nextCursor).toBeNull();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toEqual({
      id: "member-1",
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
    });
  });

  test("response does not include fullLegalName", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest("Bearer valid.token.here"));

    const body = await response.json();
    expect(body.rows[0]).not.toHaveProperty("fullLegalName");
  });

  test("returns 200 with nextCursor when more pages exist", async () => {
    const cursor = encodeCursor({ fullName: "ada lovelace", id: "member-1", username: "ada" });
    getMembersCursorPageResult = {
      rows: getMembersCursorPageResult.rows,
      nextCursor: cursor,
    };

    const { GET } = await routeModulePromise;
    const response = await GET(createRequest("Bearer valid.token.here"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.nextCursor).toBe(cursor);
  });

  test("accepts cursor query param", async () => {
    const cursor = encodeCursor({ fullName: "ada lovelace", id: "member-1", username: "ada" });
    const { GET } = await routeModulePromise;
    const response = await GET(
      createRequest("Bearer valid.token.here", { cursor }),
    );

    expect(response.status).toBe(200);
  });

  test("returns empty rows on last page", async () => {
    getMembersCursorPageResult = { rows: [], nextCursor: null };

    const { GET } = await routeModulePromise;
    const response = await GET(createRequest("Bearer valid.token.here"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  test("includes CORS headers when Origin matches allowlist", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(
      createRequest("Bearer valid.token.here", {}, "https://app.mladipirati.si"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.mladipirati.si",
    );
  });

  test("OPTIONS returns 204 preflight response", async () => {
    const { OPTIONS } = await routeModulePromise;
    const req = new Request("https://example.com/api/user/members", {
      method: "OPTIONS",
      headers: { Origin: "https://app.mladipirati.si" },
    });
    const response = OPTIONS(req);

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
