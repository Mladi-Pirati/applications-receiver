import { cache } from "react";
import { forbidden, redirect } from "next/navigation";

import { auth } from "@/auth";

export const getCurrentUser = cache(async () => {
  const session = await auth();

  return session?.user ?? null;
});

export function shouldForcePasswordChange(
  user: { forcePasswordChange?: boolean } | null | undefined,
) {
  return Boolean(user?.forcePasswordChange);
}

export const requireUser = cache(async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
});

export const requireReadyUser = cache(async () => {
  const user = await requireUser();

  if (shouldForcePasswordChange(user)) {
    redirect("/admin/settings");
  }

  return user;
});

export const requireAdmin = cache(async () => {
  const user = await requireReadyUser();

  if (user.role !== "admin") {
    forbidden();
  }

  return user;
});
