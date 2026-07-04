"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AgeBucketLabel } from "@/lib/dashboard-analytics";

const chartConfig = {
  count: {
    label: "Members",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

type AgeChartProps = {
  data: Array<{ bucket: AgeBucketLabel; count: number }>;
  excludedCount: number;
};

export function AgeChart({ data, excludedCount }: AgeChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Members by age</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="bucket"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
        {excludedCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Excludes {excludedCount.toLocaleString()} member
            {excludedCount === 1 ? "" : "s"} without a birthdate on file.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
