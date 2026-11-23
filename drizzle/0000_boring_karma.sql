CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"category" varchar(80) NOT NULL,
	"read_time_minutes" integer NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"excerpt" text NOT NULL,
	"content" text NOT NULL,
	"image_url" text NOT NULL,
	CONSTRAINT "articles_read_time_chk" CHECK ("articles"."read_time_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"actor_name" varchar(80) NOT NULL,
	"action" varchar(120) NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breeds" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"origin" varchar(120) NOT NULL,
	"summary" text NOT NULL,
	"avg_weight_kg" varchar(60) NOT NULL,
	"price_range_sar" varchar(60) NOT NULL,
	"image_url" text NOT NULL,
	"characteristics" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "breeds_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"parent_id" text,
	"description" text DEFAULT '' NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "conversation_read_states" (
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_read_states_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_distinct_parties_chk" CHECK ("conversations"."buyer_id" <> "conversations"."seller_id")
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicative_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"breed_id" text NOT NULL,
	"breed_name" varchar(100) NOT NULL,
	"category_name" varchar(80) NOT NULL,
	"age_group" varchar(100) NOT NULL,
	"min_price" numeric(12, 2) NOT NULL,
	"max_price" numeric(12, 2) NOT NULL,
	"avg_price" numeric(12, 2) NOT NULL,
	"trend" varchar(16) NOT NULL,
	"region_note" varchar(160) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicative_prices_min_chk" CHECK ("indicative_prices"."min_price" >= 0),
	CONSTRAINT "indicative_prices_max_chk" CHECK ("indicative_prices"."max_price" >= "indicative_prices"."min_price"),
	CONSTRAINT "indicative_prices_avg_chk" CHECK ("indicative_prices"."avg_price" >= "indicative_prices"."min_price" AND "indicative_prices"."avg_price" <= "indicative_prices"."max_price"),
	CONSTRAINT "indicative_prices_trend_chk" CHECK ("indicative_prices"."trend" IN ('up', 'down', 'stable'))
);
--> statement-breakpoint
CREATE TABLE "like_notification_cooldowns" (
	"listing_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"last_notified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "like_notification_cooldowns_listing_id_actor_id_pk" PRIMARY KEY("listing_id","actor_id")
);
--> statement-breakpoint
CREATE TABLE "listing_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"parent_id" text,
	"author_id" text NOT NULL,
	"author_name" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_comments_body_len_chk" CHECK (char_length("listing_comments"."body") BETWEEN 2 AND 600)
);
--> statement-breakpoint
CREATE TABLE "listing_favorites" (
	"user_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_favorites_user_id_listing_id_pk" PRIMARY KEY("user_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "listing_images" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"media_id" text,
	"url" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "listing_images_pos_chk" CHECK ("listing_images"."position" >= 1 AND "listing_images"."position" <= 8)
);
--> statement-breakpoint
CREATE TABLE "listing_likes" (
	"listing_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_likes_listing_id_user_id_pk" PRIMARY KEY("listing_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "listing_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"media_id" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"original_name" varchar(120),
	CONSTRAINT "listing_videos_listing_id_unique" UNIQUE("listing_id")
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"category_id" text NOT NULL,
	"sub_category_id" text,
	"breed_id" text NOT NULL,
	"region_id" text NOT NULL,
	"city" varchar(80) NOT NULL,
	"city_norm" text DEFAULT '' NOT NULL,
	"title" varchar(160) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"search_doc" text DEFAULT '' NOT NULL,
	"price_amount" numeric(12, 2) NOT NULL,
	"expected_price" numeric(12, 2),
	"currency" char(3) DEFAULT 'SAR' NOT NULL,
	"sex" varchar(32) NOT NULL,
	"age_months" integer NOT NULL,
	"weight_kg" numeric(8, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"is_negotiable" boolean DEFAULT false NOT NULL,
	"allow_price_offers" boolean DEFAULT false NOT NULL,
	"vaccinated" boolean DEFAULT false NOT NULL,
	"status" varchar(16) DEFAULT 'Pending' NOT NULL,
	"rejection_reason" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_slug_unique" UNIQUE("slug"),
	CONSTRAINT "listings_price_chk" CHECK ("listings"."price_amount" > 0 AND "listings"."price_amount" <= 10000000),
	CONSTRAINT "listings_expected_price_chk" CHECK ("listings"."expected_price" IS NULL OR ("listings"."expected_price" > 0 AND "listings"."expected_price" <= "listings"."price_amount")),
	CONSTRAINT "listings_currency_chk" CHECK ("listings"."currency" = 'SAR'),
	CONSTRAINT "listings_sex_chk" CHECK ("listings"."sex" IN ('ذكر', 'أنثى', 'قطيع مختلط')),
	CONSTRAINT "listings_age_months_chk" CHECK ("listings"."age_months" >= 0 AND "listings"."age_months" <= 360),
	CONSTRAINT "listings_weight_kg_chk" CHECK ("listings"."weight_kg" > 0 AND "listings"."weight_kg" <= 2000),
	CONSTRAINT "listings_quantity_chk" CHECK ("listings"."quantity" >= 1 AND "listings"."quantity" <= 100000),
	CONSTRAINT "listings_status_chk" CHECK ("listings"."status" IN ('Draft', 'Pending', 'Published', 'Rejected', 'Sold', 'Expired')),
	CONSTRAINT "listings_likes_count_chk" CHECK ("listings"."likes_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_provider" varchar(16) DEFAULT 'local' NOT NULL,
	"bucket" varchar(128),
	"object_key" text NOT NULL,
	"filename" varchar(128) NOT NULL,
	"url" text NOT NULL,
	"kind" varchar(16) NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256_hex" char(64),
	"original_name" varchar(120) NOT NULL,
	"uploader_id" text NOT NULL,
	"listing_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_provider_chk" CHECK ("media_assets"."storage_provider" IN ('local', 'gcs', 's3', 'r2')),
	CONSTRAINT "media_assets_kind_chk" CHECK ("media_assets"."kind" IN ('image', 'video')),
	CONSTRAINT "media_assets_size_kind_chk" CHECK (("media_assets"."kind" = 'image' AND "media_assets"."size_bytes" > 0 AND "media_assets"."size_bytes" <= 5242880) OR ("media_assets"."kind" = 'video' AND "media_assets"."size_bytes" > 0 AND "media_assets"."size_bytes" <= 26214400))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_body_len_chk" CHECK (char_length("messages"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" varchar(40) NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"listing_id" text,
	"conversation_id" text,
	"comment_id" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_type_chk" CHECK ("notifications"."type" IN ('offer_accepted', 'offer_rejected', 'new_message', 'new_comment', 'comment_reply', 'listing_liked', 'listing_approved', 'listing_rejected', 'seller_verified', 'seller_verification_rejected'))
);
--> statement-breakpoint
CREATE TABLE "price_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"buyer_name" varchar(80) NOT NULL,
	"seller_id" text NOT NULL,
	"offered_price" numeric(12, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_offers_amount_chk" CHECK ("price_offers"."offered_price" > 0 AND "price_offers"."offered_price" <= 10000000),
	CONSTRAINT "price_offers_quantity_chk" CHECK ("price_offers"."quantity" >= 1),
	CONSTRAINT "price_offers_status_chk" CHECK ("price_offers"."status" IN ('pending', 'accepted', 'rejected')),
	CONSTRAINT "price_offers_distinct_parties_chk" CHECK ("price_offers"."buyer_id" <> "price_offers"."seller_id")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"reporter_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"comment_id" text,
	"reason" varchar(160) NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_note" text,
	CONSTRAINT "reports_target_type_chk" CHECK ("reports"."target_type" IN ('listing', 'comment')),
	CONSTRAINT "reports_status_chk" CHECK ("reports"."status" IN ('open', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "seller_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"region_id" text NOT NULL,
	"city" varchar(80) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"whatsapp" varchar(25) NOT NULL,
	"verification_status" varchar(16) DEFAULT 'Pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_note" text,
	"verification_requested_at" timestamp with time zone,
	"verification_reviewed_at" timestamp with time zone,
	"verification_reviewed_by" text,
	"years_experience" integer DEFAULT 0 NOT NULL,
	"specialty" varchar(120) DEFAULT '' NOT NULL,
	"rating" numeric(3, 1) DEFAULT '0' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"total_sales" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_profiles_verification_status_chk" CHECK ("seller_profiles"."verification_status" IN ('Pending', 'Verified', 'Rejected')),
	CONSTRAINT "seller_profiles_years_exp_chk" CHECK ("seller_profiles"."years_experience" >= 0 AND "seller_profiles"."years_experience" <= 100),
	CONSTRAINT "seller_profiles_rating_chk" CHECK ("seller_profiles"."rating" >= 0 AND "seller_profiles"."rating" <= 5),
	CONSTRAINT "seller_profiles_rating_count_chk" CHECK ("seller_profiles"."rating_count" >= 0),
	CONSTRAINT "seller_profiles_total_sales_chk" CHECK ("seller_profiles"."total_sales" >= 0)
);
--> statement-breakpoint
CREATE TABLE "seller_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"reviewer_name" varchar(80) NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_reviews_rating_chk" CHECK ("seller_reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "seller_reviews_no_self_chk" CHECK ("seller_reviews"."seller_id" <> "seller_reviews"."reviewer_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" char(64) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" varchar(64),
	"user_agent" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(80) NOT NULL,
	"role" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspended_by" text,
	"suspension_reason" text,
	"reactivated_at" timestamp with time zone,
	"reactivated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_role_chk" CHECK ("users"."role" IN ('buyer', 'seller', 'admin')),
	CONSTRAINT "users_status_chk" CHECK ("users"."status" IN ('active', 'suspended')),
	CONSTRAINT "users_phone_sa_chk" CHECK ("users"."phone" ~ '^05[0-9]{8}$')
);
--> statement-breakpoint
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicative_prices" ADD CONSTRAINT "indicative_prices_breed_id_breeds_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."breeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "like_notification_cooldowns" ADD CONSTRAINT "like_notification_cooldowns_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "like_notification_cooldowns" ADD CONSTRAINT "like_notification_cooldowns_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD CONSTRAINT "listing_comments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD CONSTRAINT "listing_comments_parent_id_listing_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."listing_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD CONSTRAINT "listing_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_favorites" ADD CONSTRAINT "listing_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_favorites" ADD CONSTRAINT "listing_favorites_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_likes" ADD CONSTRAINT "listing_likes_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_likes" ADD CONSTRAINT "listing_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_videos" ADD CONSTRAINT "listing_videos_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_videos" ADD CONSTRAINT "listing_videos_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_sub_category_id_categories_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_breed_id_breeds_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."breeds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_listing_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."listing_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_regions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_comment_id_listing_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."listing_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_verification_reviewed_by_users_id_fk" FOREIGN KEY ("verification_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_reviews" ADD CONSTRAINT "seller_reviews_seller_id_seller_profiles_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_reviews" ADD CONSTRAINT "seller_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_reactivated_by_users_id_fk" FOREIGN KEY ("reactivated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_listing_buyer_uidx" ON "conversations" USING btree ("listing_id","buyer_id");--> statement-breakpoint
CREATE INDEX "conversations_buyer_updated_idx" ON "conversations" USING btree ("buyer_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_seller_updated_idx" ON "conversations" USING btree ("seller_id","updated_at");--> statement-breakpoint
CREATE INDEX "comments_listing_parent_created_idx" ON "listing_comments" USING btree ("listing_id","parent_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "listing_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "listing_favorites_listing_idx" ON "listing_favorites" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_images_listing_pos_uidx" ON "listing_images" USING btree ("listing_id","position");--> statement-breakpoint
CREATE INDEX "listing_images_media_idx" ON "listing_images" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "listing_likes_user_idx" ON "listing_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listing_videos_media_idx" ON "listing_videos" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "listings_published_newest_idx" ON "listings" USING btree ("published_at","id") WHERE "listings"."status" = 'Published';--> statement-breakpoint
CREATE INDEX "listings_published_price_idx" ON "listings" USING btree ("price_amount","published_at","id") WHERE "listings"."status" = 'Published';--> statement-breakpoint
CREATE INDEX "listings_published_likes_idx" ON "listings" USING btree ("likes_count","published_at","id") WHERE "listings"."status" = 'Published';--> statement-breakpoint
CREATE INDEX "listings_filters_idx" ON "listings" USING btree ("category_id","sub_category_id","breed_id","region_id") WHERE "listings"."status" = 'Published';--> statement-breakpoint
CREATE INDEX "listings_seller_status_idx" ON "listings" USING btree ("seller_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "listings_status_created_idx" ON "listings" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_one_video_per_listing_uidx" ON "media_assets" USING btree ("listing_id") WHERE "media_assets"."listing_id" IS NOT NULL AND "media_assets"."kind" = 'video';--> statement-breakpoint
CREATE INDEX "media_assets_uploader_unbound_idx" ON "media_assets" USING btree ("uploader_id","listing_id","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_listing_idx" ON "media_assets" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "messages_conv_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "price_offers_buyer_idx" ON "price_offers" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "price_offers_seller_idx" ON "price_offers" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "price_offers_listing_idx" ON "price_offers" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_unique_open_listing_uidx" ON "reports" USING btree ("reporter_id","listing_id") WHERE "reports"."status" = 'open' AND "reports"."target_type" = 'listing';--> statement-breakpoint
CREATE UNIQUE INDEX "reports_unique_open_comment_uidx" ON "reports" USING btree ("reporter_id","listing_id","comment_id") WHERE "reports"."status" = 'open' AND "reports"."target_type" = 'comment' AND "reports"."comment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "reports_status_type_created_idx" ON "reports" USING btree ("status","target_type","created_at");--> statement-breakpoint
CREATE INDEX "seller_profiles_verification_idx" ON "seller_profiles" USING btree ("verification_status");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_reviews_seller_reviewer_uidx" ON "seller_reviews" USING btree ("seller_id","reviewer_id");--> statement-breakpoint
CREATE INDEX "reviews_seller_updated_idx" ON "seller_reviews" USING btree ("seller_id","updated_at");--> statement-breakpoint
CREATE INDEX "sessions_user_last_seen_idx" ON "sessions" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at","last_seen_at");--> statement-breakpoint
CREATE INDEX "users_role_status_created_idx" ON "users" USING btree ("role","status","created_at");