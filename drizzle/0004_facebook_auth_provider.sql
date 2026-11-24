ALTER TABLE "google_identities" DROP CONSTRAINT IF EXISTS "google_identities_provider_chk";--> statement-breakpoint
ALTER TABLE "google_identities" ADD CONSTRAINT "google_identities_provider_chk" CHECK ("google_identities"."provider" IN ('google', 'facebook'));
