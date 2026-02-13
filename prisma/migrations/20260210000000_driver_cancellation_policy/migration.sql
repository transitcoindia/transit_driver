-- Driver cancellation policy: strikes, valid-reason tracking, compensation
-- Add Ride columns for driver cancellation outcome
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "driverStrikeType" TEXT;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "driverCompensationAmount" DOUBLE PRECISION;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "driverCancellationReasonType" TEXT;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "riderCallAttemptedAt" TIMESTAMP(3);

-- Driver cancellation strike (full or light)
CREATE TABLE IF NOT EXISTS "driver_cancellation_strike" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "strikeType" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_cancellation_strike_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "driver_cancellation_strike_driverId_createdAt_idx" ON "driver_cancellation_strike"("driverId", "createdAt");

ALTER TABLE "driver_cancellation_strike" DROP CONSTRAINT IF EXISTS "driver_cancellation_strike_driverId_fkey";
ALTER TABLE "driver_cancellation_strike" ADD CONSTRAINT "driver_cancellation_strike_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Valid-reason cancels in last 7 days (for penalty waiver limit)
CREATE TABLE IF NOT EXISTS "driver_valid_reason_cancel" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "reasonType" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_valid_reason_cancel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "driver_valid_reason_cancel_driverId_cancelledAt_idx" ON "driver_valid_reason_cancel"("driverId", "cancelledAt");

ALTER TABLE "driver_valid_reason_cancel" DROP CONSTRAINT IF EXISTS "driver_valid_reason_cancel_driverId_fkey";
ALTER TABLE "driver_valid_reason_cancel" ADD CONSTRAINT "driver_valid_reason_cancel_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
