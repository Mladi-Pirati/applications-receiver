import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="border-b">
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-muted-foreground">
            You are signed in, but your account does not have access to that
            area.
          </p>
          <Button asChild>
            <Link href="/admin">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
