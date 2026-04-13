import { z } from "zod";

import { USER_ROLES } from "@/db/schema";
import { usernameSchema } from "@/lib/auth/usernames";
import { passwordSchema } from "@/lib/validation/passwords";

const userDetailsSchema = {
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters long.")
    .max(120, "Full name must be 120 characters or fewer."),
  username: usernameSchema,
  role: z.enum(USER_ROLES),
};

export const createUserSchema = z.object({
  ...userDetailsSchema,
  initialPassword: passwordSchema,
});

export const updateUserSchema = z.object({
  ...userDetailsSchema,
  temporaryPassword: z.union([z.literal(""), passwordSchema]).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
