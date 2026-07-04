import { count, gte, isNotNull, isNull } from "drizzle-orm";
import { differenceInYears, startOfMonth } from "date-fns";

import { db } from "@/db";
import { members } from "@/db/schema";
import { parseDateOnly } from "@/lib/date-format";
import {
  residenceRegions,
  type ResidenceRegion,
} from "@/lib/membership-applications";

export type AgeBucketLabel =
  | "15–18"
  | "19–22"
  | "23–26"
  | "27–29"
  | "30–32"
  | "32+";

const AGE_BUCKETS: Array<{ label: AgeBucketLabel; min: number; max: number }> =
  [
    { label: "15–18", min: 15, max: 18 },
    { label: "19–22", min: 19, max: 22 },
    { label: "23–26", min: 23, max: 26 },
    { label: "27–29", min: 27, max: 29 },
    { label: "30–32", min: 30, max: 32 },
    { label: "32+", min: 33, max: Infinity },
  ];

export function bucketAge(age: number): AgeBucketLabel {
  const bucket = AGE_BUCKETS.find((b) => age >= b.min && age <= b.max);
  return bucket?.label ?? AGE_BUCKETS[0].label;
}

export function buildAgeDistribution(
  ages: Array<number>,
): Array<{ bucket: AgeBucketLabel; count: number }> {
  const counts = new Map<AgeBucketLabel, number>(
    AGE_BUCKETS.map((b) => [b.label, 0]),
  );

  for (const age of ages) {
    const bucket = bucketAge(age);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  return AGE_BUCKETS.map((b) => ({
    bucket: b.label,
    count: counts.get(b.label) ?? 0,
  }));
}

export function buildRegionDistribution(
  rows: Array<{ region: string | null; count: number }>,
): Array<{ region: ResidenceRegion; count: number }> {
  const counts = new Map(
    rows
      .filter(
        (row): row is { region: string; count: number } => row.region !== null,
      )
      .map((row) => [row.region, row.count]),
  );

  return residenceRegions.map((region) => ({
    region,
    count: counts.get(region) ?? 0,
  }));
}

export function buildGrowthSeries(
  createdAtValues: Array<Date>,
): Array<{ date: string; cumulativeTotal: number }> {
  let running = 0;
  return createdAtValues.map((createdAt) => {
    running += 1;
    return { date: createdAt.toISOString(), cumulativeTotal: running };
  });
}

export type DashboardAnalytics = {
  totalMembers: number;
  activeMembers: number;
  newThisMonth: number;
  regionDistribution: Array<{ region: ResidenceRegion; count: number }>;
  ageDistribution: Array<{ bucket: AgeBucketLabel; count: number }>;
  membersWithoutBirthdate: number;
  growthSeries: Array<{ date: string; cumulativeTotal: number }>;
};

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const [
    [{ value: totalMembers }],
    [{ value: activeMembers }],
    [{ value: newThisMonth }],
    regionRows,
    birthdateRows,
    creationRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(members),
    db
      .select({ value: count() })
      .from(members)
      .where(isNull(members.disabledAt)),
    db
      .select({ value: count() })
      .from(members)
      .where(gte(members.createdAt, startOfMonth(new Date()))),
    db
      .select({ region: members.residenceRegion, value: count() })
      .from(members)
      .where(isNotNull(members.residenceRegion))
      .groupBy(members.residenceRegion),
    db
      .select({ dateOfBirth: members.dateOfBirth })
      .from(members)
      .where(isNotNull(members.dateOfBirth)),
    db
      .select({ createdAt: members.createdAt })
      .from(members)
      .orderBy(members.createdAt),
  ]);

  const ages = birthdateRows.map((row) =>
    differenceInYears(new Date(), parseDateOnly(row.dateOfBirth!)),
  );

  return {
    totalMembers,
    activeMembers,
    newThisMonth,
    regionDistribution: buildRegionDistribution(
      regionRows.map((row) => ({ region: row.region, count: row.value })),
    ),
    ageDistribution: buildAgeDistribution(ages),
    membersWithoutBirthdate: totalMembers - birthdateRows.length,
    growthSeries: buildGrowthSeries(creationRows.map((row) => row.createdAt)),
  };
}
