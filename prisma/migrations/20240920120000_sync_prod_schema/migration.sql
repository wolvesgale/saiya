-- Sync Venue columns with prisma/schema.prisma
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "note" text;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "attachmentUrl" text;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "contactName" text;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "trashRule" text;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "cashHandling" "CashHandlingType";
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "hours" text;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "workWindow" text;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "loadInTime" text;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "loadOutTime" text;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "preContactRequired" boolean NOT NULL DEFAULT false;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "brokerNote" text;
