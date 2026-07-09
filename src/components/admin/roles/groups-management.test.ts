import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("GroupsManagement", () => {
  test("uses one per-group save button for all group edits", () => {
    const source = readFileSync(
      "src/components/admin/roles/groups-management.tsx",
      "utf8",
    );

    expect(source).toContain("function saveGroup()");
    expect(source).toContain("updateGroupAction(group.id");
    expect(source).toContain("setGroupRolesAction(group.id, roleIds)");
    expect(source).toContain("setGroupApplicationsAction(");
    expect(source).toContain("applicationIds");
    expect(source).toContain("setGroupDiscordRolesAction(");
    expect(source).toContain("discordRoles");
    expect(source).toContain("if (!applicationsResult.ok)");
    expect(source).toContain("if (!discordRolesResult.ok)");
    expect(source).toContain("Save group");
    expect(source).not.toContain("Save roles");
    expect(source).not.toContain("Save applications");
    expect(source).not.toContain("Save Discord roles");
  });
});
