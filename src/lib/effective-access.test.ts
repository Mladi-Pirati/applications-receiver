import { describe, expect, test } from "bun:test";

import { mergeEffectiveAccess } from "@/lib/effective-access";

describe("mergeEffectiveAccess", () => {
  test("returns empty access for a member with no assignments", () => {
    const access = mergeEffectiveAccess({
      directRoleIds: [],
      groupRoleIds: [],
      roles: [],
      permissions: [],
      directApplicationIds: [],
      groupApplicationIds: [],
      applications: [],
    });

    expect(access.roleIds).toEqual([]);
    expect(access.permissionKeys).toEqual([]);
    expect(access.applicationIds).toEqual([]);
  });

  test("unions and dedupes direct + group roles", () => {
    const access = mergeEffectiveAccess({
      directRoleIds: ["r1", "r2"],
      groupRoleIds: ["r2", "r3"],
      roles: [
        { id: "r1", key: "a", name: "A" },
        { id: "r2", key: "b", name: "B" },
        { id: "r3", key: "c", name: "C" },
      ],
      permissions: [],
      directApplicationIds: [],
      groupApplicationIds: [],
      applications: [],
    });

    expect([...access.roleIds].sort()).toEqual(["r1", "r2", "r3"]);
  });

  test("collects permission keys granted by any effective role", () => {
    const access = mergeEffectiveAccess({
      directRoleIds: ["r1"],
      groupRoleIds: ["r2"],
      roles: [],
      permissions: [
        { roleId: "r1", key: "members.read" },
        { roleId: "r2", key: "deck-events.moderate" },
        { roleId: "r-other", key: "newsletters.create" },
      ],
      directApplicationIds: [],
      groupApplicationIds: [],
      applications: [],
    });

    expect([...access.permissionKeys].sort()).toEqual([
      "deck-events.moderate",
      "members.read",
    ]);
  });

  test("unions direct + group application access", () => {
    const access = mergeEffectiveAccess({
      directRoleIds: [],
      groupRoleIds: [],
      roles: [],
      permissions: [],
      directApplicationIds: ["app-1"],
      groupApplicationIds: ["app-1", "app-2"],
      applications: [
        { id: "app-1", name: "One", keycloakClientId: "one" },
        { id: "app-2", name: "Two", keycloakClientId: "two" },
      ],
    });

    expect([...access.applicationIds].sort()).toEqual(["app-1", "app-2"]);
  });
});
