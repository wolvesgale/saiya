-- AlterTable: replace agencyId with intermediaryId on Venue
-- Drop foreign key constraint from Venue.agencyId -> Agency
ALTER TABLE "Venue" DROP CONSTRAINT IF EXISTS "Venue_agencyId_fkey";

-- Drop the agencyId column
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "agencyId";

-- Add intermediaryId column
ALTER TABLE "Venue" ADD COLUMN "intermediaryId" TEXT;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_intermediaryId_fkey" FOREIGN KEY ("intermediaryId") REFERENCES "Intermediary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
