import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditTrailTable = pgTable("audit_trail", {
  id: serial("id").primaryKey(),
  needId: integer("need_id").notNull(),
  action: text("action").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  performedBy: text("performed_by"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLogTable = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id"),
  type: text("type").notNull(),
  message: text("message").notNull(),
  entityId: integer("entity_id"),
  entityType: text("entity_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const credentialEmailLogTable = pgTable("credential_email_log", {
  id: serial("id").primaryKey(),
  volunteerId: integer("volunteer_id").notNull(),
  email: text("email").notNull(),
  type: text("type").notNull().default("credential"),
  status: text("status").notNull().default("sent"),
  errorMessage: text("error_message"),
  performedBy: text("performed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditSchema = createInsertSchema(auditTrailTable).omit({ id: true, createdAt: true });
export type InsertAudit = z.infer<typeof insertAuditSchema>;
export type AuditEntry = typeof auditTrailTable.$inferSelect;

export const insertActivitySchema = createInsertSchema(activityLogTable).omit({ id: true, createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type ActivityEntry = typeof activityLogTable.$inferSelect;
