import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatCardsProps = {
  totalMembers: number;
  activeMembers: number;
  newThisMonth: number;
};

export function StatCards({
  totalMembers,
  activeMembers,
  newThisMonth,
}: StatCardsProps) {
  const stats = [
    { label: "Total members", value: totalMembers },
    { label: "Active members", value: activeMembers },
    { label: "New this month", value: newThisMonth },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader>
            <CardTitle className="text-xs font-normal text-muted-foreground">
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {stat.value.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
