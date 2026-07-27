import Link from "next/link";
import { UserIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export default async function MePage() {
  const user = await requireUser();

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold">Welcome, {user.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          Manage your member information and keep your contact details up to
          date.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/me/profile">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="size-4" />
                Profile
              </CardTitle>
              <CardDescription>
                Update your profile, contacts, and addresses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs font-medium text-muted-foreground">
                Open profile settings
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
