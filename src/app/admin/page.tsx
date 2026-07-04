import { AgeChart } from "@/components/admin/dashboard/age-chart";
import { GrowthChart } from "@/components/admin/dashboard/growth-chart";
import { RegionChart } from "@/components/admin/dashboard/region-chart";
import { StatCards } from "@/components/admin/dashboard/stat-cards";
import { requireReadyUser } from "@/lib/auth/session";
import { getDashboardAnalytics } from "@/lib/dashboard-analytics";

export default async function AdminDashboardPage() {
  const user = await requireReadyUser();
  const analytics = await getDashboardAnalytics();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-xs text-muted-foreground">
          Welcome back,{" "}
          <span className="font-extrabold">{user.fullName.split(" ")[0]}</span>.
        </p>
      </div>
      <StatCards
        totalMembers={analytics.totalMembers}
        activeMembers={analytics.activeMembers}
        newThisMonth={analytics.newThisMonth}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <RegionChart data={analytics.regionDistribution} />
        <AgeChart
          data={analytics.ageDistribution}
          excludedCount={analytics.membersWithoutBirthdate}
        />
      </div>
      <GrowthChart series={analytics.growthSeries} />
    </div>
  );
}
