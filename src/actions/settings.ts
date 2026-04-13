"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { unstable_update } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createChangePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validation/settings";

export type ChangePasswordActionResult =
  | {
      ok: true;
      message: string;
      redirectTo?: string;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: Partial<Record<keyof ChangePasswordInput, string>>;
      redirectTo?: string;
    };

export async function changePasswordAction(
  values: ChangePasswordInput,
): Promise<ChangePasswordActionResult> {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    return {
      ok: false,
      message: "You must be signed in to change your password.",
      redirectTo: "/login",
    };
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, sessionUser.id),
    columns: {
      id: true,
      passwordHash: true,
      forcePasswordChange: true,
    },
  });

  if (!dbUser) {
    return {
      ok: false,
      message: "Your account could not be found.",
      redirectTo: "/login",
    };
  }

  const requiresCurrentPassword = !dbUser.forcePasswordChange;
  const parsedValues = createChangePasswordSchema({
    requiresCurrentPassword,
  }).safeParse(values);

  if (!parsedValues.success) {
    const fieldErrors = parsedValues.error.flatten().fieldErrors;

    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        currentPassword: fieldErrors.currentPassword?.[0],
        newPassword: fieldErrors.newPassword?.[0],
        confirmPassword: fieldErrors.confirmPassword?.[0],
      },
    };
  }

  if (requiresCurrentPassword) {
    const currentPasswordMatches = await verifyPassword(
      parsedValues.data.currentPassword ?? "",
      dbUser.passwordHash,
    );

    if (!currentPasswordMatches) {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: {
          currentPassword: "Current password is incorrect.",
        },
      };
    }
  }

  const matchesCurrentPassword = await verifyPassword(
    parsedValues.data.newPassword,
    dbUser.passwordHash,
  );

  if (matchesCurrentPassword) {
    return {
      ok: false,
      message: "Please choose a different password.",
      fieldErrors: {
        newPassword:
          "New password must be different from your current password.",
      },
    };
  }

  const passwordHash = await hashPassword(parsedValues.data.newPassword);

  await db
    .update(users)
    .set({
      passwordHash,
      forcePasswordChange: false,
    })
    .where(eq(users.id, dbUser.id));

  await unstable_update({
    user: {
      forcePasswordChange: false,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/settings");

  return {
    ok: true,
    message: dbUser.forcePasswordChange
      ? "Password updated. Redirecting to the dashboard."
      : "Password updated successfully.",
    redirectTo: dbUser.forcePasswordChange ? "/admin" : undefined,
  };
}
