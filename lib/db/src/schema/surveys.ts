import { pgTable, text, serial, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const surveysTable = pgTable("surveys", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  fields: jsonb("fields").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  
  // New columns
  isAcceptingResponses: boolean("is_accepting_responses").notNull().default(true),
  responseDeadline: timestamp("response_deadline", { withTimezone: true }),
  limitOneResponse: boolean("limit_one_response").notNull().default(false),
  allowResponseEditing: boolean("allow_response_editing").notNull().default(false),
  collectEmail: text("collect_email").notNull().default('none'),
  confirmationMessage: text("confirmation_message").notNull().default('Thanks for submitting your response!'),
  showProgressBar: boolean("show_progress_bar").notNull().default(false),
  shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
  themeColor: text("theme_color").notNull().default('#4CAF50'),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  isPublished: boolean("is_published").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const surveyResponsesTable = pgTable("survey_responses", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").notNull(),
  organizationId: integer("organization_id").notNull(),
  respondentName: text("respondent_name"),
  respondentPhone: text("respondent_phone"),
  
  // New columns
  respondentEmail: text("respondent_email"),
  respondentIpHash: text("respondent_ip_hash"),
  isEdited: boolean("is_edited").notNull().default(false),
  editCount: integer("edit_count").notNull().default(0),

  data: jsonb("data").notNull().default({}),
  qualityFlags: jsonb("quality_flags").notNull().default([]),
  needsCreated: integer("needs_created").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSurveySchema = createInsertSchema(surveysTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type Survey = typeof surveysTable.$inferSelect;

export const insertSurveyResponseSchema = createInsertSchema(surveyResponsesTable).omit({ id: true, createdAt: true });
export type InsertSurveyResponse = z.infer<typeof insertSurveyResponseSchema>;
export type SurveyResponse = typeof surveyResponsesTable.$inferSelect;
