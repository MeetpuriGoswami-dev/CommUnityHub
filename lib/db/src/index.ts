import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:MGoswami%408102007@db.oqudkdsbywkovgcpcvxt.supabase.co:5432/postgres";

if (!process.env.DATABASE_URL) {
  console.warn("WARNING: DATABASE_URL environment variable was not found in environment. Using default Supabase database connection.");
}

export const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export * from "./schema/index.ts";
