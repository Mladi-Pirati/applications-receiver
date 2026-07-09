import { beforeEach, describe, expect, mock, test } from "bun:test";

import { addresses, contacts, members } from "@/db/schema";

type SelfMember = {
  disabledAt: Date | null;
  firstName: string;
  id: string;
  keycloakId: string;
  lastName: string;
  username: string;
};

let currentUser: {
  fullName: string;
  id: string;
  keycloakUserId: string;
  username: string;
} | null = null;
let selfMember: SelfMember | null = null;
let primaryEmailRow: { value: string } | null = null;
let existingEmailContact: { id: string } | null = null;
let sortRows: Array<{ value: number | null }> = [];
let sequence: Array<string> = [];
let updateProfileCalls: Array<{
  userId: string;
  values: {
    email: string | null;
    firstName: string;
    lastName: string;
    username: string;
  };
}> = [];
let updateProfileError: unknown = null;
let requiredActionsEmails: Array<{ actions: Array<string>; userId: string }> =
  [];
let updateSets: Array<{ table: unknown; values: Record<string, unknown> }> = [];
let inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
let deletions: Array<unknown> = [];
let revalidatedPaths: Array<string> = [];

function createDbExecutor() {
  return {
    query: {
      members: {
        async findFirst() {
          return selfMember ?? undefined;
        },
      },
      contacts: {
        async findFirst(options: { columns: Record<string, boolean> }) {
          if (options.columns.value) {
            return primaryEmailRow ?? undefined;
          }

          return existingEmailContact ?? undefined;
        },
      },
    },
    select() {
      return {
        from() {
          return {
            async where() {
              return sortRows;
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            async where() {
              sequence.push("db:update");
              updateSets.push({ table, values });
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        async values(values: Record<string, unknown>) {
          sequence.push("db:insert");
          inserts.push({ table, values });
        },
      };
    },
    delete(table: unknown) {
      return {
        async where() {
          deletions.push(table);
        },
      };
    },
  };
}

const dbExecutor = createDbExecutor();
const db = {
  ...dbExecutor,
  async transaction(fn: (tx: typeof dbExecutor) => Promise<unknown>) {
    sequence.push("db:transaction");
    return fn(dbExecutor);
  },
};

function createMembersKeycloakAdminClient() {
  return {
    async updateUserProfile(
      userId: string,
      values: (typeof updateProfileCalls)[number]["values"],
    ) {
      if (updateProfileError) throw updateProfileError;
      sequence.push("keycloak:update-profile");
      updateProfileCalls.push({ userId, values });
    },
    async sendRequiredActionsEmail(userId: string, actions: Array<string>) {
      sequence.push("keycloak:required-actions-email");
      requiredActionsEmails.push({ actions, userId });
    },
  };
}

mock.module("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidatedPaths.push(path);
  },
}));
mock.module("@/lib/me-action-dependencies", () => ({
  createMembersKeycloakAdminClient,
  db,
  getCurrentUser: async () => currentUser,
}));

const meActionsPromise = import("./me");

const activeMember: SelfMember = {
  disabledAt: null,
  firstName: "Ada",
  id: "member-1",
  keycloakId: "kc-1",
  lastName: "Lovelace",
  username: "ada",
};

const profileInput = {
  dateOfBirth: "1990-05-01",
  firstName: "Ada",
  fullLegalName: "Ada Lovelace",
  lastName: "Lovelace",
  placeOfBirth: "Ljubljana",
  primaryEmail: "ada@example.org",
  residenceRegion: "" as const,
};

beforeEach(() => {
  currentUser = {
    fullName: "Ada Lovelace",
    id: "member-1",
    keycloakUserId: "kc-1",
    username: "ada",
  };
  selfMember = { ...activeMember };
  primaryEmailRow = { value: "ada@example.org" };
  existingEmailContact = { id: "contact-email" };
  sortRows = [{ value: 1 }];
  sequence = [];
  updateProfileCalls = [];
  updateProfileError = null;
  requiredActionsEmails = [];
  updateSets = [];
  inserts = [];
  deletions = [];
  revalidatedPaths = [];
});

describe("updateMyProfileAction", () => {
  test("rejects unauthenticated users", async () => {
    const { updateMyProfileAction } = await meActionsPromise;
    currentUser = null;

    const result = await updateMyProfileAction(profileInput);

    expect(result.ok).toBe(false);
    expect(updateSets).toEqual([]);
  });

  test("rejects disabled members", async () => {
    const { updateMyProfileAction } = await meActionsPromise;
    selfMember = {
      ...activeMember,
      disabledAt: new Date("2026-01-01T00:00:00Z"),
    };

    const result = await updateMyProfileAction(profileInput);

    expect(result).toEqual({
      ok: false,
      message: "Your account is disabled.",
    });
  });

  test("skips Keycloak when name and email are unchanged", async () => {
    const { updateMyProfileAction } = await meActionsPromise;

    const result = await updateMyProfileAction(profileInput);

    expect(result.ok).toBe(true);
    expect(updateProfileCalls).toEqual([]);
    expect(requiredActionsEmails).toEqual([]);
    const memberUpdate = updateSets.find((entry) => entry.table === members);
    expect(memberUpdate?.values).toMatchObject({
      dateOfBirth: "1990-05-01",
      placeOfBirth: "Ljubljana",
      residenceRegion: null,
    });
  });

  test("updates Keycloak before the database and sends verification on email change", async () => {
    const { updateMyProfileAction } = await meActionsPromise;

    const result = await updateMyProfileAction({
      ...profileInput,
      primaryEmail: "new@example.org",
    });

    expect(result.ok).toBe(true);
    expect(updateProfileCalls).toEqual([
      {
        userId: "kc-1",
        values: {
          email: "new@example.org",
          firstName: "Ada",
          lastName: "Lovelace",
          username: "ada",
        },
      },
    ]);
    expect(sequence.indexOf("keycloak:update-profile")).toBeLessThan(
      sequence.indexOf("db:transaction"),
    );
    expect(requiredActionsEmails).toEqual([
      { actions: ["VERIFY_EMAIL"], userId: "kc-1" },
    ]);
    expect(revalidatedPaths).toContain("/me/profile");
    expect(revalidatedPaths).toContain("/admin/members/member-1");
  });

  test("leaves the database untouched when Keycloak rejects the update", async () => {
    const { updateMyProfileAction } = await meActionsPromise;
    updateProfileError = new Error("boom");

    const result = await updateMyProfileAction({
      ...profileInput,
      firstName: "Adalyn",
    });

    expect(result).toEqual({
      ok: false,
      message: "Keycloak could not be updated. Your data was not changed.",
    });
    expect(updateSets).toEqual([]);
    expect(requiredActionsEmails).toEqual([]);
  });

  test("maps a Keycloak email conflict to a field error", async () => {
    const { updateMyProfileAction } = await meActionsPromise;
    updateProfileError = { response: { status: 409 } };

    const result = await updateMyProfileAction({
      ...profileInput,
      primaryEmail: "taken@example.org",
    });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { primaryEmail: "That email is already in use." },
    });
    expect(updateSets).toEqual([]);
  });

  test("returns field errors for invalid input", async () => {
    const { updateMyProfileAction } = await meActionsPromise;

    const result = await updateMyProfileAction({
      ...profileInput,
      dateOfBirth: "3000-01-01",
    });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        dateOfBirth: "Date of birth cannot be in the future.",
      },
    });
  });
});

describe("upsertMyContactAction", () => {
  test("stores a discord contact scoped to the own member without Keycloak", async () => {
    const { upsertMyContactAction } = await meActionsPromise;

    const result = await upsertMyContactAction({
      isPrimary: false,
      label: "",
      type: "discord",
      value: "ada#0001",
    });

    expect(result.ok).toBe(true);
    expect(updateProfileCalls).toEqual([]);
    expect(inserts).toEqual([
      {
        table: contacts,
        values: {
          isPrimary: false,
          label: "",
          memberId: "member-1",
          sortOrder: 2,
          type: "discord",
          value: "ada#0001",
        },
      },
    ]);
  });

  test("syncs a changed primary email to Keycloak first", async () => {
    const { upsertMyContactAction } = await meActionsPromise;

    const result = await upsertMyContactAction(
      {
        isPrimary: true,
        label: "",
        type: "email",
        value: "new@example.org",
      },
      "contact-email",
    );

    expect(result.ok).toBe(true);
    expect(updateProfileCalls).toEqual([
      {
        userId: "kc-1",
        values: {
          email: "new@example.org",
          firstName: "Ada",
          lastName: "Lovelace",
          username: "ada",
        },
      },
    ]);
    expect(sequence.indexOf("keycloak:update-profile")).toBeLessThan(
      sequence.indexOf("db:transaction"),
    );
    expect(requiredActionsEmails).toEqual([
      { actions: ["VERIFY_EMAIL"], userId: "kc-1" },
    ]);
  });
});

describe("address and contact removal", () => {
  test("deletes contacts and addresses scoped to the own member", async () => {
    const { deleteMyAddressAction, deleteMyContactAction } =
      await meActionsPromise;

    expect((await deleteMyContactAction("contact-1")).ok).toBe(true);
    expect((await deleteMyAddressAction("address-1")).ok).toBe(true);
    expect(deletions).toEqual([contacts, addresses]);
  });

  test("upserts addresses for the own member", async () => {
    const { upsertMyAddressAction } = await meActionsPromise;

    const result = await upsertMyAddressAction({
      city: "Ljubljana",
      country: "Slovenia",
      label: "primary",
      postalCode: "1000",
      street: "Trg 1",
    });

    expect(result.ok).toBe(true);
    expect(inserts).toEqual([
      {
        table: addresses,
        values: {
          city: "Ljubljana",
          country: "Slovenia",
          label: "primary",
          memberId: "member-1",
          postalCode: "1000",
          street: "Trg 1",
        },
      },
    ]);
  });
});
