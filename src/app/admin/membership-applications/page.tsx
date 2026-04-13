import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";

import { MembershipApplicationsManagement } from "@/components/admin/membership-applications/membership-applications-management";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { mladiPiratiMembershipApplications } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import {
  buildMembershipApplicationsListHref,
  buildMembershipApplicationsQueryString,
  membershipApplicationStatusLabels,
  membershipApplicationStatuses,
  parseMembershipApplicationsFilters,
  participationModeLabels,
  participationModes,
  type MembershipApplicationsSearchParams,
  type ParticipationMode,
  type ResidenceRegion,
} from "@/lib/membership-applications";

function FilterSelect({
  children,
  defaultValue,
  name,
}: {
  children: ReactNode;
  defaultValue?: string;
  name: string;
}) {
  return (
    <select
      className="h-8 w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
      defaultValue={defaultValue ?? ""}
      name={name}
    >
      {children}
    </select>
  );
}

export default async function AdminMembershipApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<MembershipApplicationsSearchParams>;
}) {
  await requireAdmin();
  const filters = parseMembershipApplicationsFilters(await searchParams);
  const queryString = buildMembershipApplicationsQueryString(filters);
  const whereClauses: SQL<unknown>[] = [];

  if (filters.q) {
    const searchPattern = `%${filters.q}%`;

    whereClauses.push(
      or(
        ilike(mladiPiratiMembershipApplications.fullName, searchPattern),
        ilike(mladiPiratiMembershipApplications.email, searchPattern),
        ilike(
          mladiPiratiMembershipApplications.cityAndPostalCode,
          searchPattern,
        ),
        ilike(mladiPiratiMembershipApplications.phone, searchPattern),
      )!,
    );
  }

  if (filters.status) {
    whereClauses.push(
      eq(mladiPiratiMembershipApplications.status, filters.status),
    );
  }

  if (filters.mode) {
    whereClauses.push(
      eq(mladiPiratiMembershipApplications.participationMode, filters.mode),
    );
  }

  const whereClause =
    whereClauses.length === 0
      ? undefined
      : whereClauses.length === 1
        ? whereClauses[0]
        : and(...whereClauses);

  const baseQuery = db
    .select({
      id: mladiPiratiMembershipApplications.id,
      fullName: mladiPiratiMembershipApplications.fullName,
      cityAndPostalCode:
        mladiPiratiMembershipApplications.cityAndPostalCode,
      residenceRegion: mladiPiratiMembershipApplications.residenceRegion,
      email: mladiPiratiMembershipApplications.email,
      participationMode: mladiPiratiMembershipApplications.participationMode,
      status: mladiPiratiMembershipApplications.status,
      createdAt: mladiPiratiMembershipApplications.createdAt,
    })
    .from(mladiPiratiMembershipApplications);

  const rows = await (whereClause
    ? baseQuery.where(whereClause)
    : baseQuery
  ).orderBy(desc(mladiPiratiMembershipApplications.createdAt));

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Membership applications</h1>
        <p className="text-xs text-muted-foreground">
          Review applications from a stable server-filtered queue.
        </p>
      </div>

      <form className="grid gap-3 rounded-none border p-4 sm:grid-cols-4">
        <input
          className="h-8 w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 sm:col-span-2"
          defaultValue={filters.q}
          name="q"
          placeholder="Search by name, email, city, or phone"
          type="search"
        />
        <FilterSelect defaultValue={filters.status} name="status">
          <option value="">All statuses</option>
          {membershipApplicationStatuses.map((status) => (
            <option key={status} value={status}>
              {membershipApplicationStatusLabels[status]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect defaultValue={filters.mode} name="mode">
          <option value="">All participation modes</option>
          {participationModes.map((mode) => (
            <option key={mode} value={mode}>
              {participationModeLabels[mode]}
            </option>
          ))}
        </FilterSelect>
        <div className="flex gap-2 sm:col-span-4">
          <Button type="submit">Apply filters</Button>
          <Button asChild variant="outline">
            <Link href={buildMembershipApplicationsListHref("")}>Clear</Link>
          </Button>
        </div>
      </form>

      <MembershipApplicationsManagement
        queryString={queryString}
        rows={rows.map((row) => ({
          ...row,
          participationMode: row.participationMode as ParticipationMode,
          residenceRegion: row.residenceRegion as ResidenceRegion,
          createdAt: row.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
