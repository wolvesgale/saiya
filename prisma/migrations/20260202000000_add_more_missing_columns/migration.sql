-- Add remaining missing columns referenced by schema.prisma
ALTER TABLE "Agency" ADD COLUMN IF NOT EXISTS "shopName" text;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp(3) NOT NULL DEFAULT now();
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "reportDeadline" text;
