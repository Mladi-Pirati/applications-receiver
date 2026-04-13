import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireReadyUser } from "@/lib/auth/session";

export default async function AdminDashboardPage() {
  const user = await requireReadyUser();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-xs text-muted-foreground">
          Welcome back,{" "}
          <span className="font-extrabold">{user.fullName.split(" ")[0]}</span>.
        </p>
      </div>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p>Coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
