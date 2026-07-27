import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

let allowed = true;
let revalidatedPaths: Array<string> = [];
let roleCalls: Array<{
  memberId: string;
  options: { revalidate?: boolean };
  values: { assigned: boolean; roleId: string };
}> = [];
let groupCalls: Array<{
  memberId: string;
  options: { revalidate?: boolean };
  values: { assigned: boolean; groupId: string };
}> = [];
let applicationCalls: Array<{
  memberId: string;
  options: { revalidate?: boolean };
  values: { applicationId: string; assigned: boolean };
}> = [];
let roleFailures = new Map<string, string>();
let groupFailures = new Map<string, string>();
let applicationFailures = new Map<string, string>();
let throwingGroupAssignments = new Set<string>();
let delayRoleAssignments = false;
let activeRoleAssignments = 0;
let maximumActiveRoleAssignments = 0;

async function hasPermission(permission: string) {
  expect(permission).toBe("members.role_management");
  return allowed;
}

function revalidatePath(path: string) {
  revalidatedPaths.push(path);
}

async function setMemberRoleAssignmentAction(
  memberId: string,
  values: { assigned: boolean; roleId: string },
  options: { revalidate?: boolean },
) {
  roleCalls.push({ memberId, options, values });
  if (delayRoleAssignments) {
    activeRoleAssignments += 1;
    maximumActiveRoleAssignments = Math.max(
      maximumActiveRoleAssignments,
      activeRoleAssignments,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeRoleAssignments -= 1;
  }
  const message = roleFailures.get(`${memberId}:${values.roleId}`);
  return message ? { ok: false as const, message } : { ok: true as const };
}

async function setMemberGroupAssignmentAction(
  memberId: string,
  values: { assigned: boolean; groupId: string },
  options: { revalidate?: boolean },
) {
  groupCalls.push({ memberId, options, values });
  const assignmentKey = `${memberId}:${values.groupId}`;
  if (throwingGroupAssignments.has(assignmentKey)) {
    throw new Error("Group provider failed");
  }
  const message = groupFailures.get(assignmentKey);
  return message ? { ok: false as const, message } : { ok: true as const };
}

async function setMemberApplicationAccessAction(
  memberId: string,
  values: { applicationId: string; assigned: boolean },
  options: { revalidate?: boolean },
) {
  applicationCalls.push({ memberId, options, values });
  const message = applicationFailures.get(
    `${memberId}:${values.applicationId}`,
  );
  return message ? { ok: false as const, message } : { ok: true as const };
}

mock.module("next/cache", () => ({ revalidatePath }));
mock.module("@/lib/auth/permissions", () => ({ hasPermission }));
mock.module("@/actions/members", () => ({
  setMemberRoleAssignmentAction,
}));
mock.module("@/actions/groups", () => ({
  setMemberGroupAssignmentAction,
}));
mock.module("@/actions/access-applications", () => ({
  setMemberApplicationAccessAction,
}));

const memberAssignmentsActionsPromise = import("./member-assignments");

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  allowed = true;
  revalidatedPaths = [];
  roleCalls = [];
  groupCalls = [];
  applicationCalls = [];
  roleFailures = new Map();
  groupFailures = new Map();
  applicationFailures = new Map();
  throwingGroupAssignments = new Set();
  delayRoleAssignments = false;
  activeRoleAssignments = 0;
  maximumActiveRoleAssignments = 0;
});

describe("bulkAssignMemberAccessAction", () => {
  test("requires member role-management permission", async () => {
    allowed = false;
    const { bulkAssignMemberAccessAction } =
      await memberAssignmentsActionsPromise;

    await expect(
      bulkAssignMemberAccessAction({
        memberIds: ["member-1"],
        roleIds: ["role-1"],
      }),
    ).resolves.toEqual({
      ok: false,
      message: "You are not allowed to manage member access.",
    });
    expect(roleCalls).toEqual([]);
  });

  test("requires members and at least one assignment", async () => {
    const { bulkAssignMemberAccessAction } =
      await memberAssignmentsActionsPromise;

    await expect(
      bulkAssignMemberAccessAction({
        memberIds: [],
        roleIds: ["role-1"],
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Select at least one member.",
    });
    await expect(
      bulkAssignMemberAccessAction({
        memberIds: ["member-1"],
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Choose at least one role, group, or application.",
    });
  });

  test("rejects more than 100 members or 1,000 operations", async () => {
    const { bulkAssignMemberAccessAction } =
      await memberAssignmentsActionsPromise;
    const oneHundredMembers = Array.from(
      { length: 100 },
      (_, index) => `member-${index}`,
    );

    const tooManyMembers = await bulkAssignMemberAccessAction({
      memberIds: [...oneHundredMembers, "member-100"],
      roleIds: ["role-1"],
    });
    expect(tooManyMembers.ok).toBe(false);

    await expect(
      bulkAssignMemberAccessAction({
        memberIds: oneHundredMembers,
        roleIds: Array.from({ length: 11 }, (_, index) => `role-${index}`),
      }),
    ).resolves.toEqual({
      ok: false,
      message: "This batch is too large. Choose fewer members or assignments.",
    });
    expect(roleCalls).toEqual([]);
  });

  test("deduplicates ids and additively delegates every assignment", async () => {
    const { bulkAssignMemberAccessAction } =
      await memberAssignmentsActionsPromise;

    await expect(
      bulkAssignMemberAccessAction({
        applicationIds: ["application-1", "application-1"],
        groupIds: ["group-1", "group-1"],
        memberIds: ["member-1", "member-1", "member-2"],
        roleIds: ["role-1", "role-1"],
      }),
    ).resolves.toMatchObject({
      failedAssignmentCount: 0,
      failedMemberCount: 0,
      ok: true,
      successfulAssignmentCount: 6,
    });

    expect(roleCalls).toEqual([
      {
        memberId: "member-1",
        options: { revalidate: false },
        values: { assigned: true, roleId: "role-1" },
      },
      {
        memberId: "member-2",
        options: { revalidate: false },
        values: { assigned: true, roleId: "role-1" },
      },
    ]);
    expect(groupCalls).toHaveLength(2);
    expect(applicationCalls).toHaveLength(2);
    expect(groupCalls.every((call) => call.values.assigned)).toBe(true);
    expect(applicationCalls.every((call) => call.values.assigned)).toBe(true);
    expect(revalidatedPaths).toEqual([
      "/admin/members",
      "/admin/settings/roles",
      "/admin/members/member-1",
      "/admin/members/member-2",
    ]);
  });

  test("continues after returned and thrown assignment failures", async () => {
    roleFailures.set(
      "member-1:role-1",
      "You cannot manage roles above your highest role.",
    );
    throwingGroupAssignments.add("member-2:group-1");
    applicationFailures.set(
      "member-2:application-1",
      "Keycloak access could not be granted.",
    );
    const { bulkAssignMemberAccessAction } =
      await memberAssignmentsActionsPromise;

    const result = await bulkAssignMemberAccessAction({
      applicationIds: ["application-1"],
      groupIds: ["group-1"],
      memberIds: ["member-1", "member-2"],
      roleIds: ["role-1"],
    });

    expect(result).toMatchObject({
      failedAssignmentCount: 3,
      failedMemberCount: 2,
      ok: true,
      successfulAssignmentCount: 3,
    });
    if (!result.ok) throw new Error("Expected the batch to complete.");
    expect(result.failures).toEqual([
      {
        assignmentId: "role-1",
        kind: "role",
        memberId: "member-1",
        message: "You cannot manage roles above your highest role.",
      },
      {
        assignmentId: "group-1",
        kind: "group",
        memberId: "member-2",
        message: "Unable to grant this assignment.",
      },
      {
        assignmentId: "application-1",
        kind: "application",
        memberId: "member-2",
        message: "Keycloak access could not be granted.",
      },
    ]);
    expect(roleCalls).toHaveLength(2);
    expect(groupCalls).toHaveLength(2);
    expect(applicationCalls).toHaveLength(2);
  });

  test("processes at most five members concurrently", async () => {
    delayRoleAssignments = true;
    const { bulkAssignMemberAccessAction } =
      await memberAssignmentsActionsPromise;

    const result = await bulkAssignMemberAccessAction({
      memberIds: Array.from({ length: 6 }, (_, index) => `member-${index}`),
      roleIds: ["role-1"],
    });

    expect(result).toMatchObject({
      failedAssignmentCount: 0,
      ok: true,
      successfulAssignmentCount: 6,
    });
    expect(maximumActiveRoleAssignments).toBe(5);
  });
});
