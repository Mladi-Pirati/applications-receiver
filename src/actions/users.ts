"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";

import { unstable_update } from "@/auth";
import { db } from "@/db";
import { type UserRole, users } from "@/db/schema";
import { getCurrentUser, shouldForcePasswordChange } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import {
  createUserSchema,
  type CreateUserInput,
  updateUserSchema,
  type UpdateUserInput,
} from "@/lib/validation/users";

type UserActionSuccess = {
  ok: true;
  message?: string;
};

type UserActionFailure<TField extends string> = {
  ok: false;
  message: string;
  fieldErrors?: Partial<Record<TField, string>>;
};

type CreateUserActionResult =
  | UserActionSuccess
  | UserActionFailure<keyof CreateUserInput>;

type UpdateUserActionResult =
  | UserActionSuccess
  | UserActionFailure<keyof UpdateUserInput>;

type DeleteUserActionResult =
  | {
      ok: true;
      message?: string;
    }
  | {
      ok: false;
      message: string;
    };

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function requireUserManagementAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false as const,
      message: "You are not allowed to manage users.",
    };
  }

  if (shouldForcePasswordChange(user)) {
    return {
      ok: false as const,
      message: "Change your password before managing users.",
    };
  }

  if (user.role !== "admin") {
    return {
      ok: false as const,
      message: "You are not allowed to manage users.",
    };
  }

  return {
    ok: true as const,
    user,
  };
}

async function getManagedUser(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      fullName: true,
      username: true,
      role: true,
      forcePasswordChange: true,
    },
  });

  if (!user) {
    return {
      ok: false as const,
      message: "That user could not be found.",
    };
  }

  return {
    ok: true as const,
    user,
  };
}

async function getAdminCount() {
  const adminRows = await db
    .select({
      id: users.id,
    })
    .from(users)
    .where(eq(users.role, "admin"));

  return adminRows.length;
}

function isLastAdmin(role: UserRole, adminCount: number) {
  return role === "admin" && adminCount <= 1;
}

export async function createUserAction(
  values: CreateUserInput,
): Promise<CreateUserActionResult> {
  const access = await requireUserManagementAdmin();

  if (!access.ok) {
    return {
      ok: false,
      message: access.message,
    };
  }

  const parsedValues = createUserSchema.safeParse(values);

  if (!parsedValues.success) {
    const fieldErrors = parsedValues.error.flatten().fieldErrors;

    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        fullName: fieldErrors.fullName?.[0],
        username: fieldErrors.username?.[0],
        initialPassword: fieldErrors.initialPassword?.[0],
        role: fieldErrors.role?.[0],
      },
    };
  }

  const existingUser = await db.query.users.findFirst({
    where: eq(users.username, parsedValues.data.username),
    columns: {
      id: true,
    },
  });

  if (existingUser) {
    return {
      ok: false,
      message: "That username is already taken.",
      fieldErrors: {
        username: "That username is already taken.",
      },
    };
  }

  const passwordHash = await hashPassword(parsedValues.data.initialPassword);

  try {
    await db.insert(users).values({
      fullName: parsedValues.data.fullName,
      username: parsedValues.data.username,
      passwordHash,
      forcePasswordChange: true,
      role: parsedValues.data.role,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "That username is already taken.",
        fieldErrors: {
          username: "That username is already taken.",
        },
      };
    }

    throw error;
  }

  revalidatePath("/admin/users");

  return {
    ok: true,
  };
}

export async function updateUserAction(
  userId: string,
  values: UpdateUserInput,
): Promise<UpdateUserActionResult> {
  const access = await requireUserManagementAdmin();

  if (!access.ok) {
    return {
      ok: false,
      message: access.message,
    };
  }

  const target = await getManagedUser(userId);

  if (!target.ok) {
    return {
      ok: false,
      message: target.message,
    };
  }

  const parsedValues = updateUserSchema.safeParse(values);

  if (!parsedValues.success) {
    const fieldErrors = parsedValues.error.flatten().fieldErrors;

    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        fullName: fieldErrors.fullName?.[0],
        username: fieldErrors.username?.[0],
        role: fieldErrors.role?.[0],
        temporaryPassword: fieldErrors.temporaryPassword?.[0],
      },
    };
  }

  const existingUser = await db.query.users.findFirst({
    where: and(
      eq(users.username, parsedValues.data.username),
      ne(users.id, userId),
    ),
    columns: {
      id: true,
    },
  });

  if (existingUser) {
    return {
      ok: false,
      message: "That username is already taken.",
      fieldErrors: {
        username: "That username is already taken.",
      },
    };
  }

  const isSelf = access.user.id === target.user.id;
  const isDemotingAdmin =
    target.user.role === "admin" && parsedValues.data.role !== "admin";

  if (isSelf && parsedValues.data.role !== target.user.role) {
    return {
      ok: false,
      message: "You cannot change your own role from the users table.",
      fieldErrors: {
        role: "Change your own role outside of the users table.",
      },
    };
  }

  if (isSelf && parsedValues.data.temporaryPassword) {
    return {
      ok: false,
      message: "Use Settings to change your own password.",
      fieldErrors: {
        temporaryPassword: "Use Settings to change your own password.",
      },
    };
  }

  if (isDemotingAdmin) {
    const adminCount = await getAdminCount();

    if (isLastAdmin(target.user.role, adminCount)) {
      return {
        ok: false,
        message: "You cannot demote the last remaining admin.",
        fieldErrors: {
          role: "At least one admin account must remain.",
        },
      };
    }
  }

  const updateValues: {
    fullName: string;
    username: string;
    role: UserRole;
    passwordHash?: string;
    forcePasswordChange?: boolean;
  } = {
    fullName: parsedValues.data.fullName,
    username: parsedValues.data.username,
    role: parsedValues.data.role,
  };

  if (parsedValues.data.temporaryPassword) {
    updateValues.passwordHash = await hashPassword(
      parsedValues.data.temporaryPassword,
    );
    updateValues.forcePasswordChange = true;
  }

  try {
    await db.update(users).set(updateValues).where(eq(users.id, userId));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "That username is already taken.",
        fieldErrors: {
          username: "That username is already taken.",
        },
      };
    }

    throw error;
  }

  if (
    isSelf &&
    (parsedValues.data.fullName !== target.user.fullName ||
      parsedValues.data.username !== target.user.username)
  ) {
    await unstable_update({
      user: {
        fullName: parsedValues.data.fullName,
        username: parsedValues.data.username,
      },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/users");

  return {
    ok: true,
    message: "User updated successfully.",
  };
}

export async function deleteUserAction(
  userId: string,
): Promise<DeleteUserActionResult> {
  const access = await requireUserManagementAdmin();

  if (!access.ok) {
    return {
      ok: false,
      message: access.message,
    };
  }

  const target = await getManagedUser(userId);

  if (!target.ok) {
    return {
      ok: false,
      message: target.message,
    };
  }

  if (access.user.id === target.user.id) {
    return {
      ok: false,
      message: "You cannot delete your own account.",
    };
  }

  if (target.user.role === "admin") {
    const adminCount = await getAdminCount();

    if (isLastAdmin(target.user.role, adminCount)) {
      return {
        ok: false,
        message: "You cannot delete the last remaining admin.",
      };
    }
  }

  await db.delete(users).where(eq(users.id, userId));

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/users");

  return {
    ok: true,
    message: "User deleted successfully.",
  };
}
