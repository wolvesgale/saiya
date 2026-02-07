-- Make authUserId nullable to avoid breaking existing rows
ALTER TABLE "User" ALTER COLUMN "authUserId" DROP NOT NULL;
