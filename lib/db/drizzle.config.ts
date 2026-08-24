import { defineConfig } from "drizzle-kit";
import path from "path";
import fs from "fs";

if (!process.env.DATABASE_URL) {
  // Load from root .env or current .env
  const rootEnv = path.resolve(__dirname, "../../.env");
  const localEnv = path.resolve(__dirname, "./.env");
  if (fs.existsSync(localEnv)) {
    process.loadEnvFile?.(localEnv);
  } else if (fs.existsSync(rootEnv)) {
    process.loadEnvFile?.(rootEnv);
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
