-- Add missing columns referenced by schema.prisma
ALTER TABLE "Agency" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "agencyId" uuid;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "intermediaryId" uuid;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp(3) NOT NULL DEFAULT now();

-- Create missing Intermediary table
CREATE TABLE IF NOT EXISTS "Intermediary" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  "name" text NOT NULL,
  "reportFormUrl" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
