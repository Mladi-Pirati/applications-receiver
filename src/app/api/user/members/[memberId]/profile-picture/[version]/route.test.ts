import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

const actualProfilePictures = await import("@/lib/profile-pictures");

let bearerValid = true;
let sessionValid = false;
let objectResult: {
  Body: { transformToWebStream: () => ReadableStream<Uint8Array> };
  ContentLength: number;
  ContentType: string;
  ETag: string;
  LastModified: Date;
} | null = null;

mock.module("@/auth", () => ({
  auth: async () => (sessionValid ? { user: { id: "member-1" } } : null),
}));
mock.module("@/lib/auth/session", () => ({
  isAppSessionUser: () => sessionValid,
}));
mock.module("@/lib/auth/keycloak-jwks", () => ({
  verifyKeycloakAccessToken: async () => {
    if (!bearerValid) throw new Error("Invalid token");
    return { sub: "keycloak-user-1" };
  },
}));
mock.module("@/lib/profile-pictures", () => ({
  ...actualProfilePictures,
  getMemberProfilePictureObject: async () => objectResult,
}));

const routeModulePromise = import("./route");

function request(authorization?: string, origin?: string) {
  return new Request(
    "https://helm.test/api/user/members/member-1/profile-picture/version-1",
    {
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
    },
  );
}

function context(version = "version-1") {
  return {
    params: Promise.resolve({ memberId: "member-1", version }),
  } as never;
}

beforeEach(() => {
  bearerValid = true;
  sessionValid = false;
  objectResult = {
    Body: {
      transformToWebStream: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
    },
    ContentLength: 3,
    ContentType: "image/webp",
    ETag: '"etag-1"',
    LastModified: new Date("2026-07-27T10:00:00.000Z"),
  };
});

afterAll(() => {
  mock.restore();
});

describe("GET protected profile picture", () => {
  test("requires a bearer token or Helm session without caching the error", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("accepts a session even when a supplied bearer token is invalid", async () => {
    bearerValid = false;
    sessionValid = true;
    const { GET } = await routeModulePromise;
    const response = await GET(request("Bearer invalid"), context());

    expect(response.status).toBe(200);
  });

  test("streams the current object with immutable private cache headers", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(
      request("Bearer valid", "https://logbook.mladipirati.si"),
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Content-Length")).toBe("3");
    expect(response.headers.get("ETag")).toBe('"etag-1"');
    expect(response.headers.get("Last-Modified")).toBe(
      "Mon, 27 Jul 2026 10:00:00 GMT",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://logbook.mladipirati.si",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("returns a no-store 404 when the version is stale or absent", async () => {
    objectResult = null;
    const { GET } = await routeModulePromise;
    const response = await GET(request("Bearer valid"), context("stale"));

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("profile picture CORS preflight", () => {
  test("allows configured origins and denies other origins", async () => {
    const { OPTIONS } = await routeModulePromise;
    const allowed = OPTIONS(
      new Request("https://helm.test/picture", {
        headers: { Origin: "https://logbook.mladipirati.si" },
        method: "OPTIONS",
      }),
    );
    const denied = OPTIONS(
      new Request("https://helm.test/picture", {
        headers: { Origin: "https://attacker.example" },
        method: "OPTIONS",
      }),
    );

    expect(allowed.status).toBe(204);
    expect(denied.status).toBe(403);
  });
});
