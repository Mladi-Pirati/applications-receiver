"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ResidenceRegion } from "@/lib/membership-applications";

const chartConfig = {
  count: {
    label: "Members",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type RegionChartProps = {
  data: Array<{ region: ResidenceRegion; count: number }>;
};

export function RegionChart({ data }: RegionChartProps) {
  const sorted = [...data].sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members by region</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[360px] w-full">
          <BarChart
            accessibilityLayer
            data={sorted}
            layout="vertical"
            margin={{ left: 24 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              dataKey="region"
              type="category"
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
