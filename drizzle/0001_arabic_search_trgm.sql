-- Phase 6B: Arabic search normalization function and pg_trgm GIN indexes for fast substring/token search
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_search_doc_trgm_idx" ON "listings" USING gin ("search_doc" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_city_norm_trgm_idx" ON "listings" USING gin ("city_norm" gin_trgm_ops);--> statement-breakpoint
CREATE OR REPLACE FUNCTION normalize_arabic_search(input_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT trim(
    regexp_replace(
      lower(
        translate(
          regexp_replace(
            input_text,
            E'[\u200B-\u200F\u202A-\u202E\uFEFF\u0640\u064B-\u065F\u0670\u06D6-\u06ED]',
            '',
            'g'
          ),
          'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          'ااااهيوي01234567890123456789'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;