import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, sql } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { normalizeUsername } from "../src/lib/auth/usernames";

const bootstrapAdminSchema = z.object({
  INITIAL_ADMIN_NAME: z
    .string()
    .trim()
    .min(2, "INITIAL_ADMIN_NAME is required."),
  INITIAL_ADMIN_USERNAME: z
    .string()
    .trim()
    .min(3, "INITIAL_ADMIN_USERNAME is required."),
  INITIAL_ADMIN_PASSWORD: z
    .string()
    .min(8, "INITIAL_ADMIN_PASSWORD must be at least 8 characters long."),
});

async function main() {
  const env = bootstrapAdminSchema.parse(process.env);
  const username = normalizeUsername(env.INITIAL_ADMIN_USERNAME);

  const existingAdmin = await db.query.users.findFirst({
    where: eq(users.username, username),
    columns: {
      id: true,
    },
  });

  if (existingAdmin) {
    console.log(`Admin user "${username}" already exists.`);
    return;
  }

  const passwordHash = await hashPassword(env.INITIAL_ADMIN_PASSWORD);

  await db.insert(users).values({
    fullName: env.INITIAL_ADMIN_NAME.trim(),
    username,
    passwordHash,
    forcePasswordChange: true,
    role: "admin",
  });

  console.log(`Created initial admin user "${username}".`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
