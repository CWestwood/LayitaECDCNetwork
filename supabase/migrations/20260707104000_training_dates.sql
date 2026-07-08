ALTER TABLE "public"."training"
  ADD COLUMN IF NOT EXISTS "smart_start_date" date,
  ADD COLUMN IF NOT EXISTS "first_aid_date" date,
  ADD COLUMN IF NOT EXISTS "level4_date" date,
  ADD COLUMN IF NOT EXISTS "level5_date" date,
  ADD COLUMN IF NOT EXISTS "wordworks03_date" date,
  ADD COLUMN IF NOT EXISTS "wordworks35_date" date,
  ADD COLUMN IF NOT EXISTS "littlestars_date" date,
  ADD COLUMN IF NOT EXISTS "other_date" date;
