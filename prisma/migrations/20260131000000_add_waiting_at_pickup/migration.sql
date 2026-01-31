-- Waiting time at pickup: driver arrived till OTP entered (first 3 min free; then ₹1/min 6–22, ₹1.5/min 22–6)
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "driverArrivedAtPickupAt" TIMESTAMP(3);
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "waitingCharges" DOUBLE PRECISION;
