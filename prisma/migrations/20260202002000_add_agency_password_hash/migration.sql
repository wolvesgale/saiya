-- Add missing passwordHash column for Agency
ALTER TABLE "Agency" ADD COLUMN IF NOT EXISTS "passwordHash" text;
