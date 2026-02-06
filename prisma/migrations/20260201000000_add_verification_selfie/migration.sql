-- Daily verification selfie URL (replaced each day). For admin review; profile photo stays unchanged.
ALTER TABLE "DriverDetails" ADD COLUMN IF NOT EXISTS "verificationSelfieUrl" TEXT;
