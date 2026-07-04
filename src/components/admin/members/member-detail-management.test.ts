import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

describe("member detail overview application data", () => {
  test("displays date of birth, place of birth, and residence region from the linked application", () => {
    const source = readFileSync(
      "src/components/admin/members/member-detail-management.tsx",
      "utf8",
    );
    const profileSource = source.slice(
      source.indexOf("function ProfileTab"),
      source.indexOf("function DeleteMemberDialog"),
    );

    expect(profileSource).toContain("member.dateOfBirth");
    expect(profileSource).toContain("member.placeOfBirth");
    expect(profileSource).toContain("member.residenceRegion");
    expect(profileSource).toContain("Date of birth");
    expect(profileSource).toContain("Place of birth");
    expect(profileSource).toContain("Region");
    expect(profileSource).toContain("parseDateOnly");
    expect(profileSource).toContain("formatSlovenianDate");
  });

  test("allows editing and saving the residence region", () => {
    const source = readFileSync(
      "src/components/admin/members/member-detail-management.tsx",
      "utf8",
    );
    const profileSource = source.slice(
      source.indexOf("function ProfileTab"),
      source.indexOf("function DeleteMemberDialog"),
    );

    expect(profileSource).toContain("residenceRegions");
    expect(profileSource).toContain("<SelectItem");
    expect(profileSource).toContain("onValueChange");
    expect(profileSource).toContain("UNSET_RESIDENCE_REGION");
    expect(profileSource).toContain("residenceRegion:");
    expect(profileSource).not.toContain(
      'value={member.residenceRegion ?? "Not on file"}',
    );
  });
});

describe("member detail header age display", () => {
  test("shows the member's age next to their name at the top of the page", () => {
    const source = readFileSync(
      "src/components/admin/members/member-detail-management.tsx",
      "utf8",
    );
    const headerSource = source.slice(
      source.indexOf("export function MemberDetailManagement"),
    );

    expect(source).toContain('from "date-fns"');
    expect(source).toContain("differenceInYears");
    expect(headerSource).toContain("parseDateOnly(member.dateOfBirth)");
    expect(headerSource).toContain("years old");
    expect(headerSource.indexOf("years old")).toBeLessThan(
      headerSource.indexOf("<ProfileTab"),
    );
  });
});

describe("member detail role assignment UI", () => {
  test("uses direct role toggles without expiry fields or a save button", () => {
    const source = readFileSync(
      "src/components/admin/members/member-detail-management.tsx",
      "utf8",
    );
    const rolesSource = source.slice(
      source.indexOf("function RolesTab"),
      source.indexOf("function ApplicationsTab"),
    );

    expect(rolesSource).toContain("setMemberRoleAssignmentAction");
    expect(rolesSource).toContain("Grant");
    expect(rolesSource).toContain("Remove");
    expect(rolesSource).toContain("Locked");
    expect(rolesSource).not.toContain("Save roles");
    expect(rolesSource).not.toContain("expiresAt");
    expect(rolesSource).not.toContain('type="date"');
  });
});
