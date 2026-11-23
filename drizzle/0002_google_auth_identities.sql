ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_phone_sa_chk";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_sa_chk" CHECK ("users"."phone" IS NULL OR "users"."phone" ~ '^05[0-9]{8}$');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_lower_idx" ON "users" (lower("email"));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_identities" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
  "provider" varchar(32) DEFAULT 'google' NOT NULL,
  "subject" varchar(255) NOT NULL,
  "email" varchar(255) NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "name" varchar(120) NOT NULL,
  "picture_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "google_identities_provider_chk" CHECK ("google_identities"."provider" = 'google')
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "google_identities_provider_subject_uidx" ON "google_identities" USING btree ("provider", "subject");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "google_identities_user_provider_uidx" ON "google_identities" USING btree ("user_id", "provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_identities_email_lower_idx" ON "google_identities" (lower("email"));
