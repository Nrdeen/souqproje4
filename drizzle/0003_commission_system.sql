ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "commission_pledge_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "featured_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_chk";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_chk" CHECK ("notifications"."type" IN ('offer_accepted', 'offer_rejected', 'new_message', 'new_comment', 'comment_reply', 'listing_liked', 'listing_approved', 'listing_rejected', 'seller_verified', 'seller_verification_rejected', 'commission_due', 'commission_submitted', 'commission_approved', 'commission_rejected', 'featured_approved'));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "commission_rate_percent" numeric(5, 2) DEFAULT '1' NOT NULL,
  "promo_enabled" boolean DEFAULT true NOT NULL,
  "promo_free_days" integer DEFAULT 30 NOT NULL,
  "promo_free_listings_count" integer DEFAULT 2 NOT NULL,
  "featured_weekly_price_sar" numeric(10, 2) DEFAULT '35' NOT NULL,
  "bank_name" varchar(120) DEFAULT '' NOT NULL,
  "account_holder_name" varchar(160) DEFAULT '' NOT NULL,
  "iban" varchar(34) DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_settings_rate_chk" CHECK ("platform_settings"."commission_rate_percent" >= 0 AND "platform_settings"."commission_rate_percent" <= 25),
  CONSTRAINT "platform_settings_promo_days_chk" CHECK ("platform_settings"."promo_free_days" >= 0 AND "platform_settings"."promo_free_days" <= 365),
  CONSTRAINT "platform_settings_promo_count_chk" CHECK ("platform_settings"."promo_free_listings_count" >= 0 AND "platform_settings"."promo_free_listings_count" <= 100),
  CONSTRAINT "platform_settings_featured_price_chk" CHECK ("platform_settings"."featured_weekly_price_sar" >= 0)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_records" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" varchar(24) DEFAULT 'sale_commission' NOT NULL,
  "listing_id" text REFERENCES "listings"("id") ON DELETE set null ON UPDATE no action,
  "listing_title" varchar(180) DEFAULT '' NOT NULL,
  "seller_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
  "seller_name" varchar(120) DEFAULT '' NOT NULL,
  "sold_via_platform" boolean DEFAULT true NOT NULL,
  "sale_amount_sar" numeric(12, 2) DEFAULT '0' NOT NULL,
  "rate_percent" numeric(5, 2) DEFAULT '1' NOT NULL,
  "commission_amount_sar" numeric(12, 2) DEFAULT '0' NOT NULL,
  "is_exempt" boolean DEFAULT false NOT NULL,
  "exemption_reason" varchar(32) DEFAULT 'none' NOT NULL,
  "status" varchar(24) DEFAULT 'pending_payment' NOT NULL,
  "transfer_reference" varchar(120),
  "payer_name" varchar(120),
  "transfer_amount_sar" numeric(12, 2),
  "transfer_note" text,
  "reviewed_by" text REFERENCES "users"("id") ON DELETE set null ON UPDATE no action,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "commission_records_kind_chk" CHECK ("commission_records"."kind" IN ('sale_commission', 'featured_listing')),
  CONSTRAINT "commission_records_status_chk" CHECK ("commission_records"."status" IN ('exempt', 'pending_payment', 'pending_review', 'approved', 'rejected', 'not_applicable')),
  CONSTRAINT "commission_records_exemption_chk" CHECK ("commission_records"."exemption_reason" IN ('none', 'promo_days', 'promo_free_listings', 'not_sold_via_platform')),
  CONSTRAINT "commission_records_amounts_chk" CHECK ("commission_records"."sale_amount_sar" >= 0 AND "commission_records"."commission_amount_sar" >= 0)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_records_seller_created_idx" ON "commission_records" USING btree ("seller_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_records_status_created_idx" ON "commission_records" USING btree ("status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_records_listing_idx" ON "commission_records" USING btree ("listing_id");
