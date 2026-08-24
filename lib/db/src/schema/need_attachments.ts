import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const needAttachmentsTable = pgTable("need_attachments", {
  id: serial("id").primaryKey(),
  needId: integer("need_id").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedBy: integer("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNeedAttachmentSchema = createInsertSchema(needAttachmentsTable).omit({ id: true, createdAt: true });
export type InsertNeedAttachment = z.infer<typeof insertNeedAttachmentSchema>;
export type NeedAttachment = typeof needAttachmentsTable.$inferSelect;
