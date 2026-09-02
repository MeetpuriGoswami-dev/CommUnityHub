import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  let dbStatus = "unknown";
  let dbError = null;
  let dbUrl = process.env.DATABASE_URL ? "SET (from env)" : "NOT SET (using fallback)";
  try {
    const result = await pool.query("SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = 'public'");
    dbStatus = `ok - ${result.rows[0].cnt} tables`;
  } catch(e: any) {
    dbStatus = "error";
    dbError = e?.message;
  }
  res.json({ ...data, dbStatus, dbError, dbUrl });
});

export default router;
