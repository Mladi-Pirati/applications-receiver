import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getDefaultLandingPath } from "@/lib/auth/landing";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  redirect(await getDefaultLandingPath());
}
