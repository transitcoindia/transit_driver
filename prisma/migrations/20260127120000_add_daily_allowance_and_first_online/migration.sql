-- AlterTable
ALTER TABLE "DriverSubscription" ADD COLUMN IF NOT EXISTS "dailyAllowanceMinutes" INTEGER;

-- AlterTable
ALTER TABLE "DriverStatus" ADD COLUMN IF NOT EXISTS "firstOnlineAtToday" TIMESTAMP(3);
