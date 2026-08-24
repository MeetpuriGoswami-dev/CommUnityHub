import { pgTable, text, serial, timestamp, integer, real, boolean, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const volunteersTable = pgTable("volunteers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id"),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  area: text("area").notNull(),
  skills: text("skills").array().notNull().default([]),
  languages: text("languages").array().notNull().default([]),
  availabilityStatus: text("availability_status").notNull().default("available"),
  availabilityDays: text("availability_days").array().notNull().default([]),
  availabilitySchedule: jsonb("availability_schedule"),
  // CHANGE 2c: daily availability override
  dailyOverride: text("daily_override"),
  dailyOverrideDate: date("daily_override_date"),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  tasksAssigned: integer("tasks_assigned").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  profilePhoto: text("profile_photo"),
  displayName: text("display_name"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVolunteerSchema = createInsertSchema(volunteersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVolunteer = z.infer<typeof insertVolunteerSchema>;
export type Volunteer = typeof volunteersTable.$inferSelect;
