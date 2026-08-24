import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, needAttachmentsTable, needsTable } from "@workspace/db";
import { getCurrentUser } from "../lib/auth.ts";
import { supabase, BUCKET_NAME } from "../lib/supabase.ts";
import multer from "multer";

const router: IRouter = Router();

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for attachments
});

router.get("/needs/:id/attachments", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const needId = Number(req.params.id);
  const [need] = await db.select().from(needsTable).where(eq(needsTable.id, needId));
  
  if (!need) {
    res.status(404).json({ error: "Need not found" });
    return;
  }

  // Isolation check
  if (user.role !== "super_admin" && user.organizationId !== need.organizationId) {
    res.status(403).json({ error: "Forbidden: You cannot access attachments for this need" });
    return;
  }

  const attachments = await db
    .select()
    .from(needAttachmentsTable)
    .where(eq(needAttachmentsTable.needId, needId))
    .orderBy(needAttachmentsTable.createdAt);

  res.json(attachments);
});

router.post("/needs/:id/attachments", upload.single("file"), async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const needId = Number(req.params.id);
  
  // Verify user belongs to the org of the need (unless super_admin)
  const [need] = await db.select().from(needsTable).where(eq(needsTable.id, needId));
  if (!need) {
    res.status(404).json({ error: "Need not found" });
    return;
  }

  if (user.role !== "super_admin" && user.organizationId !== need.organizationId) {
    res.status(403).json({ error: "Forbidden: You cannot upload attachments to this organization's needs" });
    return;
  }

  const fileExt = req.file.originalname.split(".").pop();
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${fileExt}`;
  const filePath = `attachments/${need.organizationId}/${needId}/${fileName}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
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

  const [attachment] = await db
    .insert(needAttachmentsTable)
    .values({
      needId,
      fileName: req.file.originalname,
      filePath: publicUrl,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: user.id,
    })
    .returning();

  res.status(201).json(attachment);
});

router.delete("/attachments/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user || user.role === "volunteer") {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const id = Number(req.params.id);
  const [attachment] = await db.select().from(needAttachmentsTable).where(eq(needAttachmentsTable.id, id));

  if (!attachment) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }

  // Cross-org check (need to join with needsTable or check the record)
  const [need] = await db.select().from(needsTable).where(eq(needsTable.id, attachment.needId));
  if (user.role !== "super_admin" && need && user.organizationId !== need.organizationId) {
    res.status(403).json({ error: "Forbidden: You cannot delete attachments from other organizations" });
    return;
  }

  // Delete from Supabase Storage
  const urlParts = attachment.filePath.split(`/storage/v1/object/public/${BUCKET_NAME}/`);
  if (urlParts.length > 1) {
    const storagePath = urlParts[1];
    const { error: deleteError } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
    if (deleteError) {
      console.warn("Failed to delete from Supabase storage:", deleteError);
    }
  }

  await db.delete(needAttachmentsTable).where(eq(needAttachmentsTable.id, id));

  res.status(204).send();
});

export default router;
