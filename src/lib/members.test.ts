import { describe, expect, test } from "bun:test";

import {
  DEFAULT_MEMBERS_PAGE_SIZE,
  MAX_MEMBERS_PAGE_SIZE,
  NO_REGION_MEMBER_FILTER,
  NO_ROLES_MEMBER_ROLE_FILTER,
  buildMembersFilterHref,
  buildMembersQueryString,
  buildMembersSortHref,
  parseMembersFilters,
} from "@/lib/members";

describe("member list filters", () => {
  test("uses stable defaults for empty search params", () => {
    expect(parseMembersFilters({})).toEqual({
      page: 1,
      pageSize: DEFAULT_MEMBERS_PAGE_SIZE,
      q: "",
      region: [],
      roleId: [],
      sort: "name-asc",
      status: "active",
    });
  });

  test("trims text filters, clamps invalid pagination, and parses sort", () => {
    expect(
      parseMembersFilters({
        page: "-8",
        pageSize: String(MAX_MEMBERS_PAGE_SIZE + 500),
        q: "  ana  ",
        region: [" Gorenjska ", "", "Goriška", "Gorenjska"],
        roleId: [" role-1 ", "", "role-2", "role-1"],
        sort: "name-desc",
        status: "disabled",
      }),
    ).toEqual({
      page: 1,
      pageSize: MAX_MEMBERS_PAGE_SIZE,
      q: "ana",
      region: ["Gorenjska", "Goriška"],
      roleId: ["role-1", "role-2"],
      sort: "name-desc",
      status: "disabled",
    });
  });

  test("falls back to name ascending for invalid sort values", () => {
    expect(parseMembersFilters({ sort: "updated-desc" }).sort).toBe(
      "name-asc",
    );
  });

  test("drops defaults when building query strings", () => {
    expect(
      buildMembersQueryString({
        page: 1,
        pageSize: DEFAULT_MEMBERS_PAGE_SIZE,
        q: "",
        region: [],
        roleId: [],
        sort: "name-asc",
        status: "active",
      }),
    ).toBe("");

    expect(
      buildMembersQueryString({
        page: 2,
        pageSize: 25,
        q: "ana",
        region: ["Gorenjska"],
        roleId: ["role-1", "role-2"],
        sort: "name-desc",
        status: "all",
      }),
    ).toBe(
      "q=ana&status=all&roleId=role-1&roleId=role-2&region=Gorenjska&sort=name-desc&page=2&pageSize=25",
    );
  });

  test("builds filter hrefs by resetting pagination and preserving page size", () => {
    expect(
      buildMembersFilterHref(
        {
          page: 4,
          pageSize: 25,
          q: "ana",
          region: ["Gorenjska"],
          roleId: ["role-1"],
          sort: "name-desc",
          status: "disabled",
        },
        {
          q: "",
          region: [],
          roleId: [],
          status: "active",
        },
      ),
    ).toBe("/admin/members?sort=name-desc&pageSize=25");
  });

  test("builds sort hrefs by toggling full-name direction and resetting pagination", () => {
    expect(
      buildMembersSortHref({
        page: 4,
        pageSize: 25,
        q: "ana",
        region: [],
        roleId: ["role-1"],
        sort: "name-asc",
        status: "disabled",
      }),
    ).toBe(
      "/admin/members?q=ana&status=disabled&roleId=role-1&sort=name-desc&pageSize=25",
    );

    expect(
      buildMembersSortHref({
        page: 2,
        pageSize: DEFAULT_MEMBERS_PAGE_SIZE,
        q: "",
        region: [],
        roleId: [],
        sort: "name-desc",
        status: "active",
      }),
    ).toBe("/admin/members");
  });

  test("preserves the no-roles role filter in member list links", () => {
    expect(
      buildMembersQueryString({
        page: 1,
        pageSize: DEFAULT_MEMBERS_PAGE_SIZE,
        q: "",
        region: [],
        roleId: [NO_ROLES_MEMBER_ROLE_FILTER],
        sort: "name-asc",
        status: "active",
      }),
    ).toBe(`roleId=${NO_ROLES_MEMBER_ROLE_FILTER}`);
  });

  test("preserves the no-region filter in member list links", () => {
    expect(
      buildMembersQueryString({
        page: 1,
        pageSize: DEFAULT_MEMBERS_PAGE_SIZE,
        q: "",
        region: [NO_REGION_MEMBER_FILTER],
        roleId: [],
        sort: "name-asc",
        status: "active",
      }),
    ).toBe(`region=${NO_REGION_MEMBER_FILTER}`);
  });
});
