CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"contact_email" text,
	"contact_phone" text,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "needs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'reported' NOT NULL,
	"area" text NOT NULL,
	"zone" text,
	"required_skills" text[] DEFAULT '{}' NOT NULL,
	"affected_count" integer DEFAULT 0 NOT NULL,
	"latitude" real,
	"longitude" real,
	"urgency_score" real,
	"reporter_name" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"resolution_note" text,
	"completion_note" text,
	"coordinator_notes" text,
	"volunteer_note" text,
	"assigned_volunteer_id" integer,
	"coordinator_id" integer,
	"date_assigned" timestamp with time zone,
	"report_date" timestamp with time zone DEFAULT now() NOT NULL,
	"need_date" date,
	"days_required" text[] DEFAULT '{}' NOT NULL,
	"start_time" text,
	"end_time" text,
	"recurring" boolean DEFAULT false NOT NULL,
	"recurrence_note" text,
	"volunteer_progress" integer DEFAULT 0 NOT NULL,
	"geocoding_failed" boolean DEFAULT false NOT NULL,
	"coordinates_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"area" text NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"availability_status" text DEFAULT 'available' NOT NULL,
	"availability_days" text[] DEFAULT '{}' NOT NULL,
	"availability_schedule" jsonb,
	"daily_override" text,
	"daily_override_date" date,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"tasks_assigned" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"profile_photo" text,
	"display_name" text,
	"latitude" real,
	"longitude" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"respondent_name" text,
	"respondent_phone" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quality_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"needs_created" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ocr_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"filename" text NOT NULL,
	"extracted_text" text NOT NULL,
	"mapped_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_score" double precision,
	"status" text DEFAULT 'pending' NOT NULL,
	"promoted_to_need_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"entity_id" integer,
	"entity_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_trail" (
	"id" serial PRIMARY KEY NOT NULL,
	"need_id" integer NOT NULL,
	"action" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"performed_by" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"volunteer_id" integer NOT NULL,
	"email" text NOT NULL,
	"type" text DEFAULT 'credential' NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error_message" text,
	"performed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"volunteer_id" integer,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'volunteer' NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteer_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"need_id" integer NOT NULL,
	"volunteer_id" integer NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"notes" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"progress_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteer_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"volunteer_id" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'info' NOT NULL,
	"related_need_id" integer,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
