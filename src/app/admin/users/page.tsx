import { desc } from "drizzle-orm";

import { UsersManagement } from "@/components/admin/users/users-management";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminUsersPage() {
  const currentUser = await requireAdmin();

  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return (
    <UsersManagement
      currentUserId={currentUser.id}
      rows={rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }))}
    />
  );
}
