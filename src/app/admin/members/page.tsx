import { asc, count, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import { MembersManagement } from "@/components/admin/members/members-management";
import { MembersFilterForm } from "@/components/admin/members/members-filter-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  accessApplications,
  groups,
  mladiPiratiMembershipApplications,
  roles,
} from "@/db/schema";
import {
  getCurrentUserPermissions,
  requirePermission,
} from "@/lib/auth/permissions";
import { formatPendingMembershipApplicationCount } from "@/lib/membership-applications";
import {
  buildMembersListHref,
  parseMembersFilters,
  type MembersSearchParams,
} from "@/lib/members";
import { getMembersPage } from "@/lib/members-query";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<MembersSearchParams>;
}) {
  await requirePermission("members.read");
  const { permissions } = await getCurrentUserPermissions();
  const filters = parseMembersFilters(await searchParams);
  const [
    { rows, pageCount, totalCount },
    roleOptions,
    groupOptions,
    applicationOptions,
    pendingApplications,
  ] = await Promise.all([
    getMembersPage(filters),
    db
      .select({
        id: roles.id,
        name: roles.name,
      })
      .from(roles)
      .orderBy(roles.rank),
    db
      .select({
        id: groups.id,
        name: groups.name,
      })
      .from(groups)
      .orderBy(asc(groups.name)),
    db
      .select({
        id: accessApplications.id,
        name: accessApplications.name,
      })
      .from(accessApplications)
      .where(isNull(accessApplications.archivedAt))
      .orderBy(asc(accessApplications.name)),
    db
      .select({ value: count() })
      .from(mladiPiratiMembershipApplications)
      .where(eq(mladiPiratiMembershipApplications.status, "pending")),
  ]);
  const pendingApplicationsCount = pendingApplications[0]?.value ?? 0;
  const filtersKey = [
    filters.q,
    filters.roleId,
    filters.sort,
    filters.status,
    filters.page,
    filters.pageSize,
  ].join(":");

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">Members</h1>
          <p className="text-xs text-muted-foreground">
            Search, review, and manage member records, roles, and access.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.includes("members.manage_onboarding") ? (
            <Button asChild variant="outline">
              <Link href="/admin/members/onboarding">Onboarding</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/admin/members/applications">
              Applications
              {pendingApplicationsCount > 0 ? (
                <Badge
                  aria-label={`${pendingApplicationsCount} pending applications`}
                  className="h-4 min-w-4 px-1 text-[10px] leading-none"
                  variant="destructive"
                >
                  {formatPendingMembershipApplicationCount(
                    pendingApplicationsCount,
                  )}
                </Badge>
              ) : null}
            </Link>
          </Button>
        </div>
      </div>

      <MembersFilterForm filters={filters} key={filtersKey} />

      <MembersManagement
        applicationOptions={applicationOptions}
        canCreate={permissions.includes("members.create")}
        canManageRoles={permissions.includes("members.role_management")}
        filters={filters}
        groupOptions={groupOptions}
        nextPageHref={buildMembersListHref({
          ...filters,
          page: Math.min(pageCount, filters.page + 1),
        })}
        page={filters.page}
        pageCount={pageCount}
        pageSize={filters.pageSize}
        pageSizeOptions={[25, 50, 100].map((pageSize) => ({
          href: buildMembersListHref({
            ...filters,
            page: 1,
            pageSize,
          }),
          value: pageSize,
        }))}
        previousPageHref={buildMembersListHref({
          ...filters,
          page: Math.max(1, filters.page - 1),
        })}
        rows={rows.map((row) => ({
          ...row,
          currentMembership: row.currentMembership
            ? {
                expiresAt:
                  row.currentMembership.expiresAt?.toISOString() ?? null,
                extendedAt: row.currentMembership.extendedAt.toISOString(),
              }
            : null,
          disabledAt: row.disabledAt?.toISOString() ?? null,
          updatedAt: row.updatedAt.toISOString(),
        }))}
        roleOptions={roleOptions}
        totalCount={totalCount}
      />
    </div>
  );
}
