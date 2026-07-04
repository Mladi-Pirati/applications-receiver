"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { format, startOfYear, subMonths } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const chartConfig = {
  cumulativeTotal: {
    label: "Total members",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

type RangeOption = "all" | "this-year" | "12m" | "6m" | "3m" | "1m";

const RANGE_OPTIONS: Array<{ value: RangeOption; label: string }> = [
  { value: "all", label: "All time" },
  { value: "this-year", label: "This year" },
  { value: "12m", label: "Last 12 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "3m", label: "Last 3 months" },
  { value: "1m", label: "Last month" },
];

function getRangeStart(range: RangeOption, now: Date): Date | null {
  switch (range) {
    case "all":
      return null;
    case "this-year":
      return startOfYear(now);
    case "12m":
      return subMonths(now, 12);
    case "6m":
      return subMonths(now, 6);
    case "3m":
      return subMonths(now, 3);
    case "1m":
      return subMonths(now, 1);
  }
}

type GrowthPoint = { date: string; cumulativeTotal: number };

function sliceGrowthSeries(
  series: Array<GrowthPoint>,
  start: Date | null,
  now: Date,
): Array<GrowthPoint> {
  if (!start) {
    return series;
  }

  const startTime = start.getTime();
  const before = series.filter(
    (point) => new Date(point.date).getTime() < startTime,
  );
  const windowed = series.filter(
    (point) => new Date(point.date).getTime() >= startTime,
  );

  const startValue =
    before.length > 0 ? before[before.length - 1].cumulativeTotal : 0;
  const points: Array<GrowthPoint> = [
    { date: start.toISOString(), cumulativeTotal: startValue },
    ...windowed,
  ];

  const lastPoint = points[points.length - 1];
  if (new Date(lastPoint.date).getTime() !== now.getTime()) {
    points.push({
      date: now.toISOString(),
      cumulativeTotal: lastPoint.cumulativeTotal,
    });
  }

  return points;
}

type GrowthChartProps = {
  series: Array<GrowthPoint>;
};

export function GrowthChart({ series }: GrowthChartProps) {
  const [range, setRange] = React.useState<RangeOption>("all");

  const data = React.useMemo(() => {
    const now = new Date();
    return sliceGrowthSeries(series, getRangeStart(range, now), now);
  }, [series, range]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Membership growth</CardTitle>
        <Select
          value={range}
          onValueChange={(value) => setRange(value as RangeOption)}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <AreaChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              tickFormatter={(value: string) =>
                format(new Date(value), "MMM d, yyyy")
              }
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    format(new Date(String(value)), "MMM d, yyyy")
                  }
                />
              }
            />
            <Area
              dataKey="cumulativeTotal"
              type="monotone"
              fill="var(--color-cumulativeTotal)"
              fillOpacity={0.2}
              stroke="var(--color-cumulativeTotal)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
