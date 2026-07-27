import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

describe("members management table implementation", () => {
  test("renders members through TanStack Table instead of the virtualized grid", () => {
    const source = readFileSync(
      "src/components/admin/members/members-management.tsx",
      "utf8",
    );

    expect(source).toContain("useReactTable");
    expect(source).toContain("getCoreRowModel");
    expect(source).toContain("type ColumnDef");
    expect(source).toContain("TableHeader");
    expect(source).toContain("TableBody");
    expect(source).toContain("TableScrollContainer");
    expect(source).not.toContain("@tanstack/react-virtual");
    expect(source).not.toContain("useVirtualizer");
  });

  test("renders URL-backed header controls for sorting and filtering", () => {
    const source = readFileSync(
      "src/components/admin/members/members-management.tsx",
      "utf8",
    );

    expect(source).toContain("buildMembersSortHref");
    expect(source).toContain("ArrowDownAZIcon");
    expect(source).toContain("ArrowUpZAIcon");
    expect(source).toContain("FilterIcon");
    expect(source).toContain("DialogTrigger");
    expect(source).toContain("Checkbox");
    expect(source).toContain("data-filter-active");
    expect(source).toContain("...props");
    expect(source).toContain("roleOptions.length > 12");
    expect(source).toContain('"max-h-[70vh] overflow-y-auto pr-1"');
    expect(source).toContain('"overflow-visible"');
    expect(source).not.toContain("SelectTrigger");
    expect(source).toContain("Status");
    expect(source).toContain("Roles");
  });

  test("removes resend welcome email from row actions", () => {
    const source = readFileSync(
      "src/components/admin/members/members-management.tsx",
      "utf8",
    );

    expect(source).not.toContain("resendWelcomeEmailAction");
    expect(source).not.toContain("MailIcon");
    expect(source).not.toContain("ResendWelcomeEmailDialog");
    expect(source).not.toContain("BulkResendWelcomeEmailDialog");
    expect(source).not.toContain("bulkResendWelcomeEmailAction");
  });

  test("supports permission-gated current-page member selection and bulk access", () => {
    const source = readFileSync(
      "src/components/admin/members/members-management.tsx",
      "utf8",
    );

    expect(source).toContain("type RowSelectionState");
    expect(source).toContain("enableRowSelection: canManageRoles");
    expect(source).toContain("onRowSelectionChange: setRowSelection");
    expect(source).toContain('id: "select"');
    expect(source).toContain("Select all visible members");
    expect(source).toContain("Select member");
    expect(source).toContain("table.toggleAllRowsSelected");
    expect(source).toContain("BulkMemberAccessDialog");
    expect(source).toContain("disabled={!hasSelection}");
    expect(source).toContain("setRowSelection({})");
    expect(source).toContain("failedAssignmentCount");
    expect(source).toContain("failureReasons");
  });

  test("renders optional searchable role, group, and application assignment fields", () => {
    const source = readFileSync(
      "src/components/admin/members/bulk-member-access-dialog.tsx",
      "utf8",
    );

    expect(source).toContain("bulkAssignMemberAccessAction");
    expect(source).toContain("function AssignmentCombobox");
    expect(source).toContain("ComboboxChipsInput");
    expect(source).toContain('label="Roles"');
    expect(source).toContain('label="Groups"');
    expect(source).toContain('label="Applications"');
    expect(source).toContain("hasAssignments");
    expect(source).toContain("members.map((member) => member.id)");
    expect(source).toContain('isPending ? "Assigning..." : "Assign access"');
    expect(source).toContain("router.refresh()");
  });

  test("renders popover controls for inline group, role, and application assignment", () => {
    const source = readFileSync(
      "src/components/admin/members/members-management.tsx",
      "utf8",
    );

    expect(source).toContain("InlineAssignmentPopover");
    expect(source).toContain("setMemberGroupAssignmentAction");
    expect(source).toContain("updateMemberRolesAction");
    expect(source).toContain("setMemberApplicationAccessAction");
    expect(source).toContain('id: "groups"');
    expect(source).toContain('id: "applications"');
    expect(source).toContain("CommandInput");
    expect(source).toContain("PopoverTrigger");

    const columnsSource = source.slice(
      source.indexOf("const columns: ColumnDef<MemberListRow>[]"),
      source.indexOf(
        "// eslint-disable-next-line react-hooks/incompatible-library",
      ),
    );
    expect(columnsSource.indexOf('id: "groups"')).toBeLessThan(
      columnsSource.indexOf('id: "roles"'),
    );
    expect(columnsSource.indexOf('id: "roles"')).toBeLessThan(
      columnsSource.indexOf('id: "applications"'),
    );
  });

  test("optimistically updates inline assignment checkboxes without closing the popover", () => {
    const source = readFileSync(
      "src/components/admin/members/members-management.tsx",
      "utf8",
    );
    const popoverSource = source.slice(
      source.indexOf("function InlineAssignmentPopover"),
      source.indexOf("export function MembersManagement"),
    );
    const updateSource = source.slice(
      source.indexOf("async function updateInlineRoles"),
      source.indexOf("const columns: ColumnDef<MemberListRow>[]"),
    );

    expect(popoverSource).toContain("optimisticAssignedIds");
    expect(popoverSource).toContain("optimisticAssignedOptions");
    expect(popoverSource).toContain("setOptimisticAssignedIds");
    expect(popoverSource).toContain("revertOptimisticAssignment");
    expect(popoverSource).toContain("emptyAssignedLabel");
    expect(popoverSource).not.toContain("setOpen(false)");
    expect(popoverSource).not.toContain("router.refresh()");
    expect(updateSource).not.toContain("router.refresh()");
    expect(updateSource).toContain("revalidate: false");
  });

  test("keeps table headers visible when there are no rows", () => {
    const source = readFileSync(
      "src/components/admin/members/members-management.tsx",
      "utf8",
    );

    expect(source).toContain("colSpan={columns.length}");
    expect(source).toContain("<TableScrollContainer>");
    expect(source).toContain("No members match the current filters.");
    expect(source).not.toContain(
      '<CardContent className="px-0">\n        {table.getRowModel().rows.length ? (',
    );
  });

  test("locks and clears Keycloak-derived add-member fields", () => {
    const source = readFileSync(
      "src/components/admin/members/members-management.tsx",
      "utf8",
    );

    expect(source).toContain("function clearSelectedUser()");
    expect(source).toContain('firstName: ""');
    expect(source).toContain('lastName: ""');
    expect(source).toContain('primaryEmail: ""');
    expect(source).toContain('username: ""');
    expect(source).toContain("disabled={Boolean(selectedUser)}");
    expect(source).toContain("disabled={Boolean(selectedUser?.email)}");
  });

  test("renders a region column with a filter dialog covering every residence region", () => {
    const source = readFileSync(
      "src/components/admin/members/members-management.tsx",
      "utf8",
    );

    expect(source).toContain("function RegionFilterDialog");
    expect(source).toContain("residenceRegions");
    expect(source).toContain("NO_REGION_MEMBER_FILTER");
    expect(source).toContain('id: "region"');
    expect(source).toContain("row.original.residenceRegion");
    expect(source).toContain("No region");

    const columnsSource = source.slice(
      source.indexOf("const columns: ColumnDef<MemberListRow>[]"),
      source.indexOf(
        "// eslint-disable-next-line react-hooks/incompatible-library",
      ),
    );
    expect(columnsSource).toContain("<RegionFilterDialog");
  });

  test("shared table headers default to extra-bold text", () => {
    const source = readFileSync("src/components/ui/table.tsx", "utf8");

    expect(source).toContain("font-extrabold");
    expect(source).not.toContain("font-medium whitespace-nowrap");
  });

  test("shared table scroll container uses a viewport-relative max height", () => {
    const source = readFileSync("src/components/ui/table.tsx", "utf8");

    expect(source).toContain("function TableScrollContainer");
    expect(source).toContain("max-h-[calc(100dvh-24rem)]");
    expect(source).toContain("overflow-auto");
    expect(source).toContain("TableScrollContainer,");
  });
});
