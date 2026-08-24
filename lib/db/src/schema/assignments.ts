import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const volunteerAssignmentsTable = pgTable("volunteer_assignments", {
  id: serial("id").primaryKey(),
  needId: integer("need_id").notNull(),
  volunteerId: integer("volunteer_id").notNull(),
  status: text("status").notNull().default("assigned"),
  notes: text("notes"),
  // CHANGE 3: progress tracking
  progress: integer("progress").notNull().default(0),
  progressNotes: jsonb("progress_notes").notNull().default([]),
  // Approval tracking
  approvalStatus: text("approval_status").notNull().default("assigned"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  declineReason: text("decline_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const volunteerNotificationsTable = pgTable("volunteer_notifications", {
  id: serial("id").primaryKey(),
  volunteerId: integer("volunteer_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"),
  relatedNeedId: integer("related_need_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVolunteerAssignmentSchema = createInsertSchema(volunteerAssignmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVolunteerNotificationSchema = createInsertSchema(volunteerNotificationsTable).omit({ id: true, createdAt: true });
export type VolunteerAssignment = typeof volunteerAssignmentsTable.$inferSelect;
export type VolunteerNotification = typeof volunteerNotificationsTable.$inferSelect;
export type InsertVolunteerAssignment = z.infer<typeof insertVolunteerAssignmentSchema>;
export type InsertVolunteerNotification = z.infer<typeof insertVolunteerNotificationSchema>;
