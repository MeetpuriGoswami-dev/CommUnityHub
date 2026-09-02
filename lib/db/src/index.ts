import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:MGoswami%408102007@db.oqudkdsbywkovgcpcvxt.supabase.co:5432/postgres";

if (!process.env.DATABASE_URL) {
  console.warn("WARNING: DATABASE_URL not set in environment, using hardcoded fallback.");
}

export const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false },
  // Serverless-friendly pool settings
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("pg pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema/index.ts";
