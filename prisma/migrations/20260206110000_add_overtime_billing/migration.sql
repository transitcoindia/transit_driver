-- AlterTable
ALTER TABLE "DriverSubscription" ADD COLUMN IF NOT EXISTS "lastOvertimeBillingAt" TIMESTAMP(3);
