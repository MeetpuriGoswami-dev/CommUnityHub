/**
 * Vercel Serverless Function: API entry point.
 *
 * This file wraps the Express app for Vercel's Node.js runtime.
 * All /api/* requests are routed here by vercel.json.
 * No cold-start delays — Vercel Functions boot in <200ms.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../artifacts/api-server/src/app.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel's VercelRequest/VercelResponse are compatible with Node's IncomingMessage/ServerResponse
  // which Express accepts natively.
  return app(req as any, res as any);
}
