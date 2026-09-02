import app from "../artifacts/api-server/dist/app.mjs";

export default function handler(req, res) {
  try {
    return app(req, res);
  } catch (err) {
    console.error("Vercel Serverless Function Error:", err);
    res.status(500).json({ error: "serverless_error", message: err?.message || String(err) });
  }
}
