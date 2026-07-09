import { describe, expect, test } from "bun:test";
import { count } from "drizzle-orm";

import { db } from "@/db";
import { members } from "@/db/schema";
import {
  NO_REGION_MEMBER_FILTER,
  NO_ROLES_MEMBER_ROLE_FILTER,
} from "@/lib/members";
import {
  buildMembersOrderBy,
  buildMembersWhere,
  getActiveRoleBadgesForMember,
  getAssignedApplicationsForMember,
  getAssignedGroupsForMember,
  getPrimaryEmailForMember,
} from "@/lib/members-query";

describe("member query email selection", () => {
  test("chooses the primary email contact for a member", () => {
    expect(
      getPrimaryEmailForMember("member-1", [
        {
          isPrimary: false,
          memberId: "member-1",
          sortOrder: 0,
          value: "secondary@example.test",
        },
        {
          isPrimary: true,
          memberId: "member-1",
          sortOrder: 1,
          value: "primary@example.test",
        },
        {
          isPrimary: true,
          memberId: "member-2",
          sortOrder: 0,
          value: "other@example.test",
        },
      ]),
    ).toBe("primary@example.test");
  });
});

describe("member query inline assignments", () => {
  test("returns assigned role badges without expiry dates", () => {
    expect(
      getActiveRoleBadgesForMember(
        "member-1",
        [
          {
            memberId: "member-1",
            roleId: "role-1",
            roleKey: "regional",
            roleName: "Regional",
          },
          {
            memberId: "member-1",
            roleId: "role-2",
            roleKey: "trusted",
            roleName: "Trusted",
          },
          {
            memberId: "member-2",
            roleId: "role-3",
            roleKey: "other",
            roleName: "Other",
          },
        ],
      ),
    ).toEqual([
      {
        id: "role-1",
        key: "regional",
        name: "Regional",
      },
      {
        id: "role-2",
        key: "trusted",
        name: "Trusted",
      },
    ]);
  });

  test("groups assigned applications for a member", () => {
    expect(
      getAssignedApplicationsForMember("member-1", [
        {
          applicationId: "app-1",
          applicationName: "Forum",
          memberId: "member-1",
        },
        {
          applicationId: "app-2",
          applicationName: "Wiki",
          memberId: "member-2",
        },
      ]),
    ).toEqual([{ id: "app-1", name: "Forum" }]);
  });

  test("returns assigned group badges for a member", () => {
    expect(
      getAssignedGroupsForMember("member-1", [
        {
          groupId: "group-1",
          groupName: "Board",
          memberId: "member-1",
        },
        {
          groupId: "group-2",
          groupName: "Regional",
          memberId: "member-1",
        },
        {
          groupId: "group-3",
          groupName: "Other",
          memberId: "member-2",
        },
      ]),
    ).toEqual([
      { id: "group-1", name: "Board" },
      { id: "group-2", name: "Regional" },
    ]);
  });
});

describe("member query role filtering", () => {
  test("filters no-role members without role expiry checks", () => {
    const where = buildMembersWhere({
      page: 1,
      pageSize: 50,
      q: "",
      region: [],
      roleId: [NO_ROLES_MEMBER_ROLE_FILTER],
      sort: "name-asc",
      status: "active",
    });

    const query = db
      .select({ value: count() })
      .from(members)
      .where(where)
      .toSQL();

    expect(query.sql).not.toContain("expires_at");
    expect(query.params).toEqual([]);
  });

  test("filters by any selected active role", () => {
    const where = buildMembersWhere({
      page: 1,
      pageSize: 50,
      q: "",
      region: [],
      roleId: ["role-1", "role-2"],
      sort: "name-asc",
      status: "active",
    });

    const query = db
      .select({ value: count() })
      .from(members)
      .where(where)
      .toSQL();

    expect(query.sql).toContain('"member_roles"."role_id" in ($1, $2)');
    expect(query.sql).toContain('"group_roles"."role_id" in ($3, $4)');
    expect(query.sql).not.toContain("expires_at");
    expect(query.params).toEqual(["role-1", "role-2", "role-1", "role-2"]);
  });

  test("combines selected roles and no-role filter with OR logic", () => {
    const where = buildMembersWhere({
      page: 1,
      pageSize: 50,
      q: "",
      region: [],
      roleId: [NO_ROLES_MEMBER_ROLE_FILTER, "role-1"],
      sort: "name-asc",
      status: "all",
    });

    const query = db
      .select({ value: count() })
      .from(members)
      .where(where)
      .toSQL();

    expect(query.sql).toContain("not exists");
    expect(query.sql).toContain('"member_roles"."role_id" in ($1)');
    expect(query.sql).toContain('"group_roles"."role_id" in ($2)');
    expect(query.sql).toContain(" or ");
    expect(query.sql).not.toContain("expires_at");
    expect(query.params).toEqual(["role-1", "role-1"]);
  });
});

describe("member query region filtering", () => {
  test("filters by any selected region", () => {
    const where = buildMembersWhere({
      page: 1,
      pageSize: 50,
      q: "",
      region: ["Gorenjska", "Goriška"],
      roleId: [],
      sort: "name-asc",
      status: "active",
    });

    const query = db
      .select({ value: count() })
      .from(members)
      .where(where)
      .toSQL();

    expect(query.sql).toContain('"members"."residence_region" in ($1, $2)');
    expect(query.params).toEqual(["Gorenjska", "Goriška"]);
  });

  test("filters members with no region on file", () => {
    const where = buildMembersWhere({
      page: 1,
      pageSize: 50,
      q: "",
      region: [NO_REGION_MEMBER_FILTER],
      roleId: [],
      sort: "name-asc",
      status: "active",
    });

    const query = db
      .select({ value: count() })
      .from(members)
      .where(where)
      .toSQL();

    expect(query.sql).toContain('"members"."residence_region" is null');
    expect(query.params).toEqual([]);
  });

  test("combines selected regions and no-region filter with OR logic", () => {
    const where = buildMembersWhere({
      page: 1,
      pageSize: 50,
      q: "",
      region: [NO_REGION_MEMBER_FILTER, "Gorenjska"],
      roleId: [],
      sort: "name-asc",
      status: "active",
    });

    const query = db
      .select({ value: count() })
      .from(members)
      .where(where)
      .toSQL();

    expect(query.sql).toContain('"members"."residence_region" is null');
    expect(query.sql).toContain('"members"."residence_region" in ($1)');
    expect(query.sql).toContain(" or ");
    expect(query.params).toEqual(["Gorenjska"]);
  });
});

describe("member query full-name sorting", () => {
  test("orders members by normalized full name ascending by default", () => {
    const query = db
      .select({ id: members.id })
      .from(members)
      .orderBy(...buildMembersOrderBy("name-asc"))
      .toSQL();

    expect(query.sql).toContain(
      'order by lower(trim(("members"."first_name" || $1 || "members"."last_name"))) asc',
    );
    expect(query.sql).toContain('"members"."username" asc');
    expect(query.sql).toContain('"members"."id" asc');
  });

  test("orders members by normalized full name descending", () => {
    const query = db
      .select({ id: members.id })
      .from(members)
      .orderBy(...buildMembersOrderBy("name-desc"))
      .toSQL();

    expect(query.sql).toContain(
      'order by lower(trim(("members"."first_name" || $1 || "members"."last_name"))) desc',
    );
    expect(query.sql).toContain('"members"."username" asc');
    expect(query.sql).toContain('"members"."id" asc');
  });
});
