-- Add setupDayBefore column to Venue
-- true  = 前日設置
-- false = 当日設置
-- null  = 未設定
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "setupDayBefore" BOOLEAN;
