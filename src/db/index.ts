import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

declare global {
  var __applicationsSql__: postgres.Sql | undefined;
}

function createClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return postgres(databaseUrl, {
    prepare: false,
  });
}

const sqlClient = globalThis.__applicationsSql__ ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__applicationsSql__ = sqlClient;
}

export const sql = sqlClient;
export const db = drizzle(sqlClient, { schema });
