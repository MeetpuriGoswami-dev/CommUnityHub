import { Router, type IRouter } from "express";
import { eq, and, or } from "drizzle-orm";
import { db, smartDriveFilesTable, organizationsTable } from "@workspace/db";
import { getCurrentUser } from "../lib/auth";
import { supabase, BUCKET_NAME } from "../lib/supabase";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as xlsx from "xlsx";
import mammoth from "mammoth";

const router: IRouter = Router();

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

router.get("/smart-drive", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user || !user.organizationId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const orgId = Number(req.query.organizationId);
  // Strict check: non-super-admins can only see their own org's files
  if (isNaN(orgId) || (user.role !== "super_admin" && orgId !== user.organizationId)) {
    res.status(403).json({ error: "Forbidden: You can only access your organization's files" });
    return;
  }

  let filterCondition;

  if (user.role === "volunteer") {
    // Volunteers see only approved & visible files, plus their own uploads (pending or otherwise)
    filterCondition = and(
      eq(smartDriveFilesTable.organizationId, orgId),
      or(
        and(
          eq(smartDriveFilesTable.isVisibleToVolunteers, true),
          eq(smartDriveFilesTable.status, "approved")
        ),
        eq(smartDriveFilesTable.uploadedBy, user.id)
      )
    );
  } else {
    // Admins and coordinators see all files in their org
    filterCondition = eq(smartDriveFilesTable.organizationId, orgId);
  }

  const files = await db
    .select()
    .from(smartDriveFilesTable)
    .where(filterCondition)
    .orderBy(smartDriveFilesTable.createdAt);

  res.json(files);
});

router.post("/smart-drive/upload", upload.single("file"), async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user || !["admin", "coordinator", "super_admin", "volunteer"].includes(user.role)) {
    res.status(403).json({ error: "Access Denied" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const organizationId = Number(req.body.organizationId);
  // Strict check: non-super-admins can only upload to their own org
  if (isNaN(organizationId) || (user.role !== "super_admin" && organizationId !== user.organizationId)) {
    res.status(403).json({ error: "Forbidden: You can only upload to your own organization" });
    return;
  }

  const fileExt = req.file.originalname.split(".").pop();
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${fileExt}`;
  const filePath = `smart-drive/${organizationId}/${fileName}`;

  // Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    });

  if (uploadError) {
    console.error("Supabase Upload Error:", uploadError);
    res.status(500).json({ error: "Failed to upload to storage" });
    return;
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

  const referer = req.get("Referer") || "";
  const isFromUploadHub = referer.includes("volunteer-dashboard");
  const initialStatus = (user.role === "volunteer" || isFromUploadHub) ? "pending" : "approved";

  const [fileRecord] = await db
    .insert(smartDriveFilesTable)
    .values({
      organizationId,
      fileName: req.file.originalname,
      filePath: publicUrl, // Now storing the Supabase public URL
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: user.id,
      status: initialStatus,
    })
    .returning();

  res.status(201).json(fileRecord);
});

router.patch("/smart-drive/:id", async (req, res): Promise<void> => {
  try {
    const user = await getCurrentUser(req.headers.cookie);
    if (!user || user.role === "volunteer") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const id = Number(req.params.id);
    const [file] = await db.select().from(smartDriveFilesTable).where(eq(smartDriveFilesTable.id, id));

    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    if (user.role !== "super_admin" && file.organizationId !== user.organizationId) {
      res.status(403).json({ error: "Forbidden: You cannot modify files from other organizations" });
      return;
    }

    const updates: any = {};
    if (typeof req.body.isVisibleToVolunteers === 'boolean') {
      updates.isVisibleToVolunteers = req.body.isVisibleToVolunteers;
    }
    if (['approved', 'pending', 'rejected'].includes(req.body.status)) {
      updates.status = req.body.status;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update provided in request body." });
      return;
    }

    const [updatedFile] = await db
      .update(smartDriveFilesTable)
      .set(updates)
      .where(eq(smartDriveFilesTable.id, id))
      .returning();

    res.json(updatedFile);
  } catch (error) {
    console.error("Smart Drive PATCH Error:", error);
    res.status(500).json({ error: "Internal server error during patch" });
  }
});

router.delete("/smart-drive/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user || !["admin", "coordinator", "super_admin"].includes(user.role)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const id = Number(req.params.id);
  const [file] = await db.select().from(smartDriveFilesTable).where(eq(smartDriveFilesTable.id, id));

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  // Ownership check
  if (user.role !== "super_admin" && file.organizationId !== user.organizationId) {
    res.status(403).json({ error: "Forbidden: You cannot delete files from other organizations" });
    return;
  }

  // Delete from Supabase Storage
  // Extract path from URL
  const urlParts = file.filePath.split(`/storage/v1/object/public/${BUCKET_NAME}/`);
  if (urlParts.length > 1) {
    const storagePath = urlParts[1];
    const { error: deleteError } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
    if (deleteError) {
      console.warn("Failed to delete from Supabase storage:", deleteError);
    }
  }

  await db.delete(smartDriveFilesTable).where(eq(smartDriveFilesTable.id, id));

  res.status(204).send();
});

router.post("/smart-drive/quick-scan", upload.single("file"), async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user || user.role === "volunteer") {
    res.status(403).json({ error: "Access Denied: Admin access required for AI scanning." });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded for scanning" });
    return;
  }

  const organizationId = Number(req.body.organizationId);
  const org = await db.select().from(organizationsTable).where(eq(organizationsTable.id, organizationId));
  
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: "Gemini API Configuration Missing. Please add GEMINI_API_KEY to the backend .env" });
    return;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: { maxOutputTokens: 8192, temperature: 0.1 }
  });

  const prompt = `You are an expert Data Intelligence AI. 
Analyze the provided document carefully and generate a highly professional, 3-page branded Analysis Report.

STRICT DESIGN SKELETON:
You MUST output a COMPLETE HTML document starting with <!DOCTYPE html> and including <head> and <body>.
Use the exact CSS provided below. Do NOT hallucinate your own classes or remove these styles.

CSS TO USE (INLINE IN <head><style>):
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#e8e8e8;padding:24px 0}
.page{width:794px;min-height:1123px;background:#fff;margin:0 auto 32px;position:relative;box-shadow:0 2px 16px rgba(0,0,0,0.13);overflow:hidden;page-break-after:always}
.cover-header{background:#1a6b5c;padding:56px 64px 40px;position:relative;overflow:hidden}
.logo-img{height:44px;width:auto}
.report-badge{display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);color:rgba(255,255,255,0.85);font-size:10px;text-transform:uppercase;padding:5px 14px;border-radius:20px;margin-bottom:16px}
.cover-title{font-size:32px;font-weight:600;color:#fff;line-height:1.2;margin-bottom:10px}
.cover-meta{display:flex;gap:32px;padding-top:28px;border-top:1px solid rgba(255,255,255,0.15)}
.mi-label{font-size:10px;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:4px}
.mi-val{font-size:13px;font-weight:500;color:#fff}
.accent-bar{height:5px;background:linear-gradient(90deg,#e8931a 0%,#f0b855 100%)}
.body-pad{padding:40px 64px}
.sec-label{font-size:10px;text-transform:uppercase;color:#1a6b5c;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.sec-label::after{content:'';flex:1;height:1px;background:#e5e5e5}
.exec-box{background:#f4faf7;border-left:3px solid #1a6b5c;border-radius:0 8px 8px 0;padding:18px 20px}
.exec-box p{font-size:13px;line-height:1.8;color:#333}
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:36px}
.stat-card{background:#f7f7f7;border-radius:8px;padding:16px;text-align:center}
.stat-num{font-size:26px;font-weight:600;color:#1a6b5c}
.stat-lbl{font-size:11px;color:#888;margin-top:4px}
.issues-table, .loc-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px}
.issues-table th, .loc-table th{background:#f0f0f0;text-align:left;padding:9px 12px;font-size:10px;color:#666;border-bottom:1px solid #e0e0e0}
.issues-table td, .loc-table td{padding:10px 12px;border-bottom:0.5px solid #f0f0f0;color:#333}
.cat-item{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f7f7f7;border-radius:6px;margin-bottom:8px}
.reco-list{list-style:none;display:flex;flex-direction:column;gap:10px}
.reco-num{width:22px;height:22px;background:#1a6b5c;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}
.page-footer{position:absolute;bottom:0;left:0;right:0;padding:16px 64px;border-top:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center}
.needs-section{margin-bottom:28px}
.needs-rank{width:28px;height:28px;border-radius:50%;background:#1a6b5c;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
@media print { body{background:white;padding:0} .page{box-shadow:none;margin:0;page-break-after:always} }

CONTENT GUIDELINES:
- Page 1: Cover Header, Meta info (Org: ${org[0]?.name || "NGO"}, File: ${req.file.originalname}), Executive Summary, Stats, Severity/Distribution, Top Data Table.
- Page 2: Secondary Analysis Table, Category Breakdown, Bullet Recommendations, Quality Notes.
- Page 3: Top 3 Deep-Dives in structured ranks.
- You have the right to rename any table heading or title to match the data input context.

Return ONLY the raw HTML code. Use /FullHorizontalLockUp.png for the logo image source.`;

  try {
    let fileData = req.file.buffer.toString("base64");
    let mimeType = req.file.mimetype;

    if (mimeType.includes("spreadsheetml") || mimeType.includes("excel") || mimeType === "application/vnd.ms-excel") {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const csvData = xlsx.utils.sheet_to_csv(firstSheet);
      fileData = Buffer.from(csvData).toString("base64");
      mimeType = "text/csv";
    } else if (mimeType.includes("wordprocessingml") || mimeType.includes("document") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const extracted = await mammoth.extractRawText({ buffer: req.file.buffer });
      fileData = Buffer.from(extracted.value).toString("base64");
      mimeType = "text/plain";
    }

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: fileData,
          mimeType: mimeType
        }
      }
    ]);

    const rawText = result.response.text();
    let cleanHtml = rawText.replace(/```html/gi, '').replace(/```/g, '').trim();
    
    res.json({ html: cleanHtml });
  } catch (error: any) {
    console.error("Gemini Scan Error:", error);
    res.status(500).json({ error: error.message || "Failed to scan document with AI." });
  }
});

export default router;
