import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const smartDriveFilesTable = pgTable("smart_drive_files", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedBy: integer("uploaded_by").notNull(),
  isVisibleToVolunteers: boolean("is_visible_to_volunteers").notNull().default(false),
  status: text("status", { enum: ["approved", "pending", "rejected"] }).notNull().default("approved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSmartDriveFileSchema = createInsertSchema(smartDriveFilesTable).omit({ id: true, createdAt: true });
export type InsertSmartDriveFile = z.infer<typeof insertSmartDriveFileSchema>;
export type SmartDriveFile = typeof smartDriveFilesTable.$inferSelect;
