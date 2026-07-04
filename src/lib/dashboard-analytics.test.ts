import { describe, expect, test } from "bun:test";

import {
  bucketAge,
  buildAgeDistribution,
  buildGrowthSeries,
  buildRegionDistribution,
} from "@/lib/dashboard-analytics";

describe("age bucketing", () => {
  test("buckets ages at the documented boundaries", () => {
    expect(bucketAge(18)).toBe("15–18");
    expect(bucketAge(19)).toBe("19–22");
    expect(bucketAge(22)).toBe("19–22");
    expect(bucketAge(23)).toBe("23–26");
    expect(bucketAge(26)).toBe("23–26");
    expect(bucketAge(27)).toBe("27–29");
    expect(bucketAge(29)).toBe("27–29");
    expect(bucketAge(30)).toBe("30–32");
    expect(bucketAge(32)).toBe("30–32");
    expect(bucketAge(33)).toBe("32+");
  });

  test("clamps ages below the youngest bucket into the first bucket instead of dropping them", () => {
    expect(bucketAge(10)).toBe("15–18");
  });

  test("catches members older than the nominal cap in the overflow bucket", () => {
    expect(bucketAge(50)).toBe("32+");
  });

  test("builds a full distribution including empty buckets", () => {
    expect(buildAgeDistribution([19, 19, 50])).toEqual([
      { bucket: "15–18", count: 0 },
      { bucket: "19–22", count: 2 },
      { bucket: "23–26", count: 0 },
      { bucket: "27–29", count: 0 },
      { bucket: "30–32", count: 0 },
      { bucket: "32+", count: 1 },
    ]);
  });
});

describe("region distribution zero-fill", () => {
  test("includes regions with zero members", () => {
    const distribution = buildRegionDistribution([
      { region: "Gorenjska", count: 3 },
    ]);

    expect(distribution).toHaveLength(12);
    expect(distribution.find((r) => r.region === "Gorenjska")?.count).toBe(3);
    expect(distribution.find((r) => r.region === "Pomurska")?.count).toBe(0);
  });

  test("handles no members having a region set", () => {
    const distribution = buildRegionDistribution([]);

    expect(distribution).toHaveLength(12);
    expect(distribution.every((r) => r.count === 0)).toBe(true);
  });
});

describe("cumulative growth series", () => {
  test("computes a running total ordered by createdAt", () => {
    const series = buildGrowthSeries([
      new Date("2024-01-01T00:00:00Z"),
      new Date("2024-01-02T00:00:00Z"),
      new Date("2024-01-03T00:00:00Z"),
    ]);

    expect(series.map((point) => point.cumulativeTotal)).toEqual([1, 2, 3]);
  });

  test("returns an empty series with no members", () => {
    expect(buildGrowthSeries([])).toEqual([]);
  });
});
