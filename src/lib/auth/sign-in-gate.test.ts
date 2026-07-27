import { beforeEach, describe, expect, mock, test } from "bun:test";

const CLIENT_ID = "helm-test-client";

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  keycloakId: string | null;
  username: string;
  disabledAt: Date | null;
};

let memberByKeycloakId: MemberRow | null = null;
let memberByUsername: { id: string } | null = null;
let keycloakManagedMemberRows: Array<{ id: string }> = [];
let superadminRole: { id: string } | null = { id: "role-superadmin" };
let insertedMemberRoles: Array<{
  grantedBy: string | null;
  memberId: string;
  roleId: string;
}> = [];
let insertedMembers: Array<Record<string, unknown>> = [];
let memberUpdates: Array<Record<string, unknown>> = [];

const db = {
  query: {
    members: {
      async findFirst(options: { columns: Record<string, boolean> }) {
        if (options.columns.disabledAt) {
          return memberByKeycloakId ?? undefined;
        }

        return memberByUsername ?? undefined;
      },
    },
    roles: {
      async findFirst() {
        return superadminRole ?? undefined;
      },
    },
  },
  select() {
    return {
      from() {
        return {
          where() {
            return {
              async limit() {
                return keycloakManagedMemberRows;
              },
            };
          },
        };
      },
    };
  },
  insert() {
    return {
      values(values: Record<string, unknown>) {
        const result = {
          returning() {
            insertedMembers.push(values);
            return Promise.resolve([{ id: "new-member" }]);
          },
          then(resolve: (value: unknown) => unknown) {
            insertedMemberRoles.push(
              values as (typeof insertedMemberRoles)[number],
            );
            return Promise.resolve(undefined).then(resolve);
          },
        };

        return result;
      },
    };
  },
  update() {
    return {
      set(values: Record<string, unknown>) {
        return {
          async where() {
            memberUpdates.push(values);
          },
        };
      },
    };
  },
};

mock.module("@/lib/auth/sign-in-gate-dependencies", () => ({ db }));

const signInGatePromise = import("./sign-in-gate");

function profileWithClientRole(sub: string, extra: Record<string, unknown> = {}) {
  return {
    sub,
    resource_access: {
      [CLIENT_ID]: { roles: ["user"] },
    },
    ...extra,
  };
}

beforeEach(() => {
  process.env.KEYCLOAK_CLIENT_ID = CLIENT_ID;
  memberByKeycloakId = null;
  memberByUsername = null;
  keycloakManagedMemberRows = [];
  superadminRole = { id: "role-superadmin" };
  insertedMemberRoles = [];
  insertedMembers = [];
  memberUpdates = [];
});

describe("ensureLocalUserForSignIn", () => {
  test("rejects profiles without a subject", async () => {
    const { ensureLocalUserForSignIn } = await signInGatePromise;

    expect(await ensureLocalUserForSignIn({}, undefined)).toBe(false);
  });

  test("allows an existing member without any client role", async () => {
    const { ensureLocalUserForSignIn } = await signInGatePromise;
    memberByKeycloakId = {
      id: "member-1",
      firstName: "Ada",
      lastName: "Lovelace",
      keycloakId: "kc-1",
      username: "ada",
      disabledAt: null,
    };

    expect(await ensureLocalUserForSignIn({ sub: "kc-1" }, undefined)).toBe(
      true,
    );
    expect(insertedMemberRoles).toEqual([]);
  });

  test("rejects a disabled member even with a client role", async () => {
    const { ensureLocalUserForSignIn } = await signInGatePromise;
    memberByKeycloakId = {
      id: "member-1",
      firstName: "Ada",
      lastName: "Lovelace",
      keycloakId: "kc-1",
      username: "ada",
      disabledAt: new Date("2026-01-01T00:00:00Z"),
    };

    expect(
      await ensureLocalUserForSignIn(profileWithClientRole("kc-1"), undefined),
    ).toBe(false);
  });

  test("rejects unknown users without a client role", async () => {
    const { ensureLocalUserForSignIn } = await signInGatePromise;

    expect(await ensureLocalUserForSignIn({ sub: "kc-new" }, undefined)).toBe(
      false,
    );
    expect(insertedMembers).toEqual([]);
  });

  test("rejects unknown users when Keycloak-managed members already exist", async () => {
    const { ensureLocalUserForSignIn } = await signInGatePromise;
    keycloakManagedMemberRows = [{ id: "member-1" }];

    expect(
      await ensureLocalUserForSignIn(profileWithClientRole("kc-new"), undefined),
    ).toBe(false);
    expect(insertedMembers).toEqual([]);
  });

  test("bootstraps the first client-role user as superadmin", async () => {
    const { ensureLocalUserForSignIn } = await signInGatePromise;

    expect(
      await ensureLocalUserForSignIn(
        profileWithClientRole("kc-new", {
          preferred_username: "grace",
          given_name: "Grace",
          family_name: "Hopper",
        }),
        undefined,
      ),
    ).toBe(true);
    expect(insertedMembers).toEqual([
      {
        firstName: "Grace",
        fullLegalName: "Grace Hopper",
        lastName: "Hopper",
        keycloakId: "kc-new",
        username: "grace",
      },
    ]);
    expect(insertedMemberRoles).toEqual([
      {
        grantedBy: null,
        memberId: "new-member",
        roleId: "role-superadmin",
      },
    ]);
  });

  test("links an existing username match instead of creating a member", async () => {
    const { ensureLocalUserForSignIn } = await signInGatePromise;
    memberByUsername = { id: "member-legacy" };

    expect(
      await ensureLocalUserForSignIn(
        profileWithClientRole("kc-new", {
          preferred_username: "grace",
          given_name: "Grace",
          family_name: "Hopper",
        }),
        undefined,
      ),
    ).toBe(true);
    expect(insertedMembers).toEqual([]);
    expect(memberUpdates).toEqual([
      {
        firstName: "Grace",
        fullLegalName: "Grace Hopper",
        lastName: "Hopper",
        keycloakId: "kc-new",
        username: "grace",
      },
    ]);
    expect(insertedMemberRoles).toEqual([
      {
        grantedBy: null,
        memberId: "member-legacy",
        roleId: "role-superadmin",
      },
    ]);
  });
});
