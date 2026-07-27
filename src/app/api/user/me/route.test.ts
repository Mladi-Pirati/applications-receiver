import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

import type { JWTPayload } from "jose";

// --- mock state ---

let verifyResult: JWTPayload | Error = { sub: "keycloak-user-123" };

let memberQueryResult: {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  disabledAt: Date | null;
} | null = {
  id: "member-abc",
  firstName: "Ada",
  lastName: "Lovelace",
  username: "ada",
  disabledAt: null,
};

let contactsResult: Array<{
  type: string;
  value: string;
  label: string | null;
  isPrimary: boolean;
  sortOrder: number;
}> = [
  {
    type: "email",
    value: "ada@example.com",
    label: null,
    isPrimary: true,
    sortOrder: 0,
  },
];

let membershipsResult: Array<{
  extendedAt: Date;
  expiresAt: Date | null;
  endedAt: Date | null;
}> = [
  {
    extendedAt: new Date("2025-01-01"),
    expiresAt: new Date("2026-01-01"),
    endedAt: null,
  },
];

let rolesResult: Array<{ key: string; name: string }> = [
  { key: "superadmin", name: "Superadmin" },
];

let applicationsResult: Array<{
  id: string;
  name: string;
  keycloakClientId: string;
}> = [{ id: "app-1", name: "Legalizirajmo", keycloakClientId: "legalizirajmo" }];

// --- mock tables ---

const membersTable = { keycloakId: "keycloak_id" };
const contactsTable = {
  memberId: "member_id",
  type: "type",
  value: "value",
  label: "label",
  isPrimary: "is_primary",
  sortOrder: "sort_order",
};
const membershipsTable = {
  memberId: "member_id",
  extendedAt: "extended_at",
  expiresAt: "expires_at",
  endedAt: "ended_at",
};
const memberRolesTable = { memberId: "member_id", roleId: "role_id" };
const rolesTable = { id: "id", key: "key", name: "name" };
const memberApplicationAccessTable = {
  memberId: "member_id",
  applicationId: "application_id",
};
const accessApplicationsTable = {
  id: "id",
  name: "name",
  keycloakClientId: "keycloak_client_id",
  archivedAt: "archived_at",
};

const db = {
  query: {
    members: {
      async findFirst() {
        return memberQueryResult;
      },
    },
  },
  select(_shape: unknown) {
    return {
      from(table: unknown) {
        if (table === contactsTable) {
          return { where: (_cond: unknown) => Promise.resolve(contactsResult) };
        }
        if (table === membershipsTable) {
          return {
            where: (_cond: unknown) => Promise.resolve(membershipsResult),
          };
        }
        if (table === memberRolesTable) {
          return {
            innerJoin(_t: unknown, _on: unknown) {
              return {
                where: (_cond: unknown) => Promise.resolve(rolesResult),
              };
            },
          };
        }
        // memberApplicationAccess table
        return {
          innerJoin(_t: unknown, _on: unknown) {
            return {
              where: (_cond: unknown) => Promise.resolve(applicationsResult),
            };
          },
        };
      },
    };
  },
};

async function verifyKeycloakAccessToken(_token: string): Promise<JWTPayload> {
  if (verifyResult instanceof Error) {
    throw verifyResult;
  }
  return verifyResult;
}

mock.module("@/lib/auth/keycloak-jwks", () => ({ verifyKeycloakAccessToken }));
mock.module("@/db", () => ({ db }));
mock.module("@/db/schema", () => ({
  members: membersTable,
  contacts: contactsTable,
  memberships: membershipsTable,
  memberRoles: memberRolesTable,
  roles: rolesTable,
  memberApplicationAccess: memberApplicationAccessTable,
  accessApplications: accessApplicationsTable,
}));

const routeModulePromise = import("./route");

function createRequest(authHeader?: string, origin?: string) {
  return new Request("https://example.com/api/user/me", {
    method: "GET",
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
  });
}

beforeEach(() => {
  verifyResult = { sub: "keycloak-user-123" };
  memberQueryResult = {
    id: "member-abc",
    firstName: "Ada",
    lastName: "Lovelace",
    username: "ada",
    disabledAt: null,
  };
  contactsResult = [
    {
      type: "email",
      value: "ada@example.com",
      label: null,
      isPrimary: true,
      sortOrder: 0,
    },
  ];
  membershipsResult = [
    {
      extendedAt: new Date("2025-01-01"),
      expiresAt: new Date("2026-01-01"),
      endedAt: null,
    },
  ];
  rolesResult = [{ key: "superadmin", name: "Superadmin" }];
  applicationsResult = [
    { id: "app-1", name: "Legalizirajmo", keycloakClientId: "legalizirajmo" },
  ];
});

afterAll(() => {
  mock.restore();
});

describe("GET /api/user/me", () => {
  test("returns 401 when Authorization header is missing", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest() as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="helm"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("returns 401 when Authorization header is not Bearer format", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest("Basic dXNlcjpwYXNz") as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="helm"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("returns 401 when token verification throws", async () => {
    const { GET } = await routeModulePromise;
    verifyResult = new Error("JWTExpired");
    const response = await GET(
      createRequest("Bearer expired.token.here") as never,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid token." });
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer realm="helm", error="invalid_token", error_description="Token verification failed"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("returns 401 when token has no sub claim", async () => {
    const { GET } = await routeModulePromise;
    verifyResult = { iss: "https://keycloak.example.com/realms/test" };
    const response = await GET(
      createRequest("Bearer valid.but.no.sub") as never,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid token." });
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer realm="helm", error="invalid_token", error_description="Token verification failed"',
    );
  });

  test("returns 404 when no member matches the token sub", async () => {
    const { GET } = await routeModulePromise;
    memberQueryResult = null;
    const response = await GET(
      createRequest("Bearer valid.token.here") as never,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "User not found." });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("returns 403 when member account is disabled", async () => {
    const { GET } = await routeModulePromise;
    memberQueryResult = {
      id: "member-abc",
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      disabledAt: new Date("2025-06-01"),
    };
    const response = await GET(
      createRequest("Bearer valid.token.here") as never,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Account disabled." });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("returns 200 with full member profile on success", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(
      createRequest("Bearer valid.token.here") as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      id: "member-abc",
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      contacts: [
        {
          type: "email",
          value: "ada@example.com",
          label: null,
          isPrimary: true,
          sortOrder: 0,
        },
      ],
      memberships: [
        {
          extendedAt: "2025-01-01T00:00:00.000Z",
          expiresAt: "2026-01-01T00:00:00.000Z",
          endedAt: null,
        },
      ],
      profilePicture: null,
      roles: [{ key: "superadmin", name: "Superadmin" }],
      applications: [
        { id: "app-1", name: "Legalizirajmo", keycloakClientId: "legalizirajmo" },
      ],
    });
  });

  test("returns 200 with empty arrays when member has no contacts, memberships, roles, or applications", async () => {
    const { GET } = await routeModulePromise;
    contactsResult = [];
    membershipsResult = [];
    rolesResult = [];
    applicationsResult = [];
    const response = await GET(
      createRequest("Bearer valid.token.here") as never,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      id: "member-abc",
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      contacts: [],
      memberships: [],
      profilePicture: null,
      roles: [],
      applications: [],
    });
  });

  test("includes CORS headers when Origin matches allowlist", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(
      createRequest("Bearer valid.token.here", "https://app.mladipirati.si") as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.mladipirati.si",
    );
  });

  test("OPTIONS returns 204 preflight response", async () => {
    const { OPTIONS } = await routeModulePromise;
    const req = new Request("https://example.com/api/user/me", {
      method: "OPTIONS",
      headers: { Origin: "https://app.mladipirati.si" },
    });
    const response = OPTIONS(req);

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "GET",
    );
  });
});
