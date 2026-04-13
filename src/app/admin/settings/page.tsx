import { PasswordChangeForm } from "@/components/admin/settings/password-change-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export default async function AdminSettingsPage() {
  const user = await requireUser();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground">
          {user.forcePasswordChange
            ? "Change your temporary password before continuing to the rest of the admin panel."
            : "Manage the password used to access the admin panel."}
        </p>
      </div>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as @{user.username}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1">
            <p className="text-sm font-medium">{user.fullName}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>@{user.username}</span>
              <Badge variant={user.role === "admin" ? "default" : "outline"}>
                {user.role}
              </Badge>
            </div>
          </div>
          {user.forcePasswordChange ? (
            <p className="text-xs text-muted-foreground">
              Access to other protected pages will remain locked until you
              update your password.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Password</CardTitle>
          <CardDescription>
            {user.forcePasswordChange
              ? "Set a new password to finish activating your account."
              : "Enter your current password and choose a new one."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordChangeForm forcePasswordChange={user.forcePasswordChange} />
        </CardContent>
      </Card>
    </div>
  );
}
