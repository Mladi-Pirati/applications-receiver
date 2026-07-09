import { and, eq, max } from "drizzle-orm";

import type { db } from "@/db";
import { contacts } from "@/db/schema";

export type DbExecutor = {
  insert: typeof db.insert;
  query: typeof db.query;
  select: typeof db.select;
  update: typeof db.update;
};

export async function ensurePrimaryEmail(
  memberId: string,
  email: string,
  tx: DbExecutor,
) {
  const existingEmail = await tx.query.contacts.findFirst({
    columns: { id: true },
    where: and(eq(contacts.memberId, memberId), eq(contacts.type, "email")),
  });

  await tx
    .update(contacts)
    .set({ isPrimary: false })
    .where(and(eq(contacts.memberId, memberId), eq(contacts.type, "email")));

  if (existingEmail) {
    await tx
      .update(contacts)
      .set({ isPrimary: true, value: email })
      .where(eq(contacts.id, existingEmail.id));
    return;
  }

  const [sortRow] = await tx
    .select({ value: max(contacts.sortOrder) })
    .from(contacts)
    .where(eq(contacts.memberId, memberId));

  await tx.insert(contacts).values({
    isPrimary: true,
    memberId,
    sortOrder: Number(sortRow?.value ?? -1) + 1,
    type: "email",
    value: email,
  });
}
