import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string | Array<string>;
  }>;
};

function getLoginErrorMessage(error: string | Array<string> | undefined) {
  const value = Array.isArray(error) ? error[0] : error;

  if (value === "AccessDenied") {
    return "Your Keycloak account is not allowed to access this application.";
  }

  if (value) {
    return "Unable to sign in right now.";
  }

  return undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="border-b">
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Sign in with your Keycloak account to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm errorMessage={getLoginErrorMessage(params?.error)} />
        </CardContent>
      </Card>
    </main>
  );
}
