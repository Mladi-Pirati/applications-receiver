import { z } from "zod";

import { usernameSchema } from "@/lib/auth/usernames";

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;
