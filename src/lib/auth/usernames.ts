import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters long.")
  .max(32, "Username must be 32 characters or fewer.")
  .regex(
    /^[a-z0-9._-]+$/i,
    "Username may only contain letters, numbers, dots, dashes, and underscores.",
  )
  .transform((value) => value.toLowerCase());

export function normalizeUsername(username: string) {
  return usernameSchema.parse(username);
}
