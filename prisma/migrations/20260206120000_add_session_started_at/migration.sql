-- AlterTable
ALTER TABLE "driver_status" ADD COLUMN IF NOT EXISTS "sessionStartedAt" TIMESTAMP(3);
