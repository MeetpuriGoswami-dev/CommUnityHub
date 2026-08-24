import { pgTable, text, serial, timestamp, integer, real, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const needsTable = pgTable("needs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("reported"),
  area: text("area").notNull(),
  zone: text("zone"),
  requiredSkills: text("required_skills").array().notNull().default([]),
  affectedCount: integer("affected_count").notNull().default(0),
  latitude: real("latitude"),
  longitude: real("longitude"),
  urgencyScore: real("urgency_score"),
  reporterName: text("reporter_name"),
  sourceType: text("source_type").notNull().default("manual"),
  resolutionNote: text("resolution_note"),
  completionNote: text("completion_note"),
  coordinatorNotes: text("coordinator_notes"),
  volunteerNote: text("volunteer_note"),
  assignedVolunteerId: integer("assigned_volunteer_id"),
  coordinatorId: integer("coordinator_id"),
  dateAssigned: timestamp("date_assigned", { withTimezone: true }),
  reportDate: timestamp("report_date", { withTimezone: true }).notNull().defaultNow(),
  // CHANGE 1: scheduling fields
  needDate: date("need_date", { mode: "string" }),
  daysRequired: text("days_required").array().notNull().default([]),
  startTime: text("start_time"),
  endTime: text("end_time"),
  recurring: boolean("recurring").notNull().default(false),
  recurrenceNote: text("recurrence_note"),
  // CHANGE 3: progress tracking
  volunteerProgress: integer("volunteer_progress").notNull().default(0),
  // CHANGE 4: geocoding flags
  geocodingFailed: boolean("geocoding_failed").notNull().default(false),
  coordinatesLocked: boolean("coordinates_locked").notNull().default(false),
  importBatchId: text("import_batch_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNeedSchema = createInsertSchema(needsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNeed = z.infer<typeof insertNeedSchema>;
export type Need = typeof needsTable.$inferSelect;
