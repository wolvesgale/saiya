-- AlterTable: replace agencyId with intermediaryId on Venue
-- Drop foreign key constraint from Venue.agencyId -> Agency (no-op if already absent)
ALTER TABLE "Venue" DROP CONSTRAINT IF EXISTS "Venue_agencyId_fkey";

-- Drop the agencyId column (no-op if already absent or never applied)
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "agencyId";

-- Add intermediaryId column (no-op if already present)
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "intermediaryId" TEXT;

-- AddForeignKey (no-op if constraint already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Venue_intermediaryId_fkey'
  ) THEN
    ALTER TABLE "Venue" ADD CONSTRAINT "Venue_intermediaryId_fkey"
      FOREIGN KEY ("intermediaryId") REFERENCES "Intermediary"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END;
$$;
