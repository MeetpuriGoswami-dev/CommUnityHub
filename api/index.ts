/**
 * Vercel Serverless Function: API entry point.
 *
 * This file wraps the Express app for Vercel's Node.js runtime.
 * All /api/* requests are routed here by vercel.json.
 * No cold-start delays — Vercel Functions boot in <200ms.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../artifacts/api-server/src/app.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return app(req as any, res as any);
  } catch (err: any) {
    console.error("Vercel Serverless Handler Error:", err);
    res.status(500).json({ error: "serverless_error", message: err?.message || String(err) });
  }
}
