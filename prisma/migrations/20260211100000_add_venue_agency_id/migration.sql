-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "agencyId" TEXT;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
