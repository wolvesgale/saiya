-- Add authUserId to User and backfill for existing rows.
ALTER TABLE "User" ADD COLUMN "authUserId" TEXT;

UPDATE "User"
SET "authUserId" = "id"
WHERE "authUserId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "authUserId" SET NOT NULL;

CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");
