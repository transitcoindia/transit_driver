-- CreateEnum
CREATE TYPE "statusDriver" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DriverStatusType" AS ENUM ('OFFLINE', 'ONLINE', 'BUSY', 'BREAK');

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRides" INTEGER NOT NULL DEFAULT 0,
    "totalEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profileImage" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "bankDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverDocument" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT,
    "documentUrl" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationNotes" TEXT,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedDate" TIMESTAMP(3),

    CONSTRAINT "DriverDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverSubscription" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "status" "statusDriver" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paymentId" TEXT,
    "paymentMode" TEXT,
    "autoRenewed" BOOLEAN NOT NULL DEFAULT false,
    "remainingMinutes" INTEGER,

    CONSTRAINT "DriverSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "id" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "hasCNG" BOOLEAN NOT NULL DEFAULT false,
    "hasElectric" BOOLEAN NOT NULL DEFAULT false,
    "roofTop" BOOLEAN NOT NULL DEFAULT false,
    "fuelType" TEXT,
    "seatingCapacity" INTEGER,
    "insuranceStatus" BOOLEAN NOT NULL DEFAULT false,
    "insuranceExpiryDate" TIMESTAMP(3),
    "registrationExpiryDate" TIMESTAMP(3),
    "vehicleImages" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isInService" BOOLEAN NOT NULL DEFAULT true,
    "lastMaintenance" TIMESTAMP(3),
    "nextMaintenance" TIMESTAMP(3),
    "currentLocation" JSONB,
    "currentSpeed" DOUBLE PRECISION,
    "currentBattery" DOUBLE PRECISION,
    "currentFuel" DOUBLE PRECISION,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "totalDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "features" JSONB,
    "amenities" JSONB,
    "documents" JSONB,
    "serviceHistory" JSONB,
    "currentZoneId" TEXT,
    "driverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ride" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "dropoffLocation" TEXT NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "fare" DOUBLE PRECISION NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "duration" INTEGER,
    "baseFare" DOUBLE PRECISION NOT NULL,
    "surgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "waitingTime" INTEGER,
    "cancellationFee" DOUBLE PRECISION,
    "cancellationReason" TEXT,
    "cancelledBy" TEXT,
    "driverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zoneId" TEXT,
    "route" JSONB,
    "waypoints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "profileImage" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "transactionId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT,
    "metadata" JSONB,
    "rideId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refundReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_location" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isInTrip" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_location" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "address" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFrequentlyUsed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_status" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "DriverStatusType" NOT NULL DEFAULT 'OFFLINE',
    "lastPingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalOnlineHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_request" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pickupLatitude" DOUBLE PRECISION NOT NULL,
    "pickupLongitude" DOUBLE PRECISION NOT NULL,
    "pickupAddress" TEXT,
    "dropLatitude" DOUBLE PRECISION,
    "dropLongitude" DOUBLE PRECISION,
    "dropAddress" TEXT,
    "rideType" TEXT NOT NULL DEFAULT 'STANDARD',
    "maxWaitTime" INTEGER NOT NULL DEFAULT 300,
    "estimatedDistance" DOUBLE PRECISION,
    "estimatedDuration" INTEGER,
    "estimatedFare" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "assignedDriverId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancelledBy" TEXT,
    "bookingId" TEXT,

    CONSTRAINT "ride_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_ride_requests" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "rideRequestId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "response" TEXT,
    "distanceToPickup" DOUBLE PRECISION,
    "etaToPickup" INTEGER,
    "rejectionReason" TEXT,

    CONSTRAINT "driver_ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "boundary" JSONB NOT NULL,
    "coordinates" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "baseFare" DOUBLE PRECISION NOT NULL,
    "perKmRate" DOUBLE PRECISION NOT NULL,
    "perMinRate" DOUBLE PRECISION NOT NULL,
    "minFare" DOUBLE PRECISION NOT NULL,
    "maxFare" DOUBLE PRECISION,
    "waitingChargePerMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cancellationFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "surgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "surgeActive" BOOLEAN NOT NULL DEFAULT false,
    "surgeReason" TEXT,
    "surgeStartTime" TIMESTAMP(3),
    "surgeEndTime" TIMESTAMP(3),
    "maxDrivers" INTEGER,
    "currentDrivers" INTEGER NOT NULL DEFAULT 0,
    "minDrivers" INTEGER NOT NULL DEFAULT 0,
    "demandLevel" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "trafficFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "weatherFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "operatingHours" JSONB,
    "holidays" JSONB,
    "bbox" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_log" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "trip_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking" (
    "id" TEXT NOT NULL,
    "rideRequestId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "actualDistance" DOUBLE PRECISION,
    "actualDuration" INTEGER,
    "finalFare" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_email_key" ON "Driver"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_phoneNumber_key" ON "Driver"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_licenseNumber_key" ON "Driver"("licenseNumber");

-- CreateIndex
CREATE INDEX "Driver_isAvailable_isVerified_idx" ON "Driver"("isAvailable", "isVerified");

-- CreateIndex
CREATE INDEX "Driver_city_isAvailable_idx" ON "Driver"("city", "isAvailable");

-- CreateIndex
CREATE INDEX "DriverDocument_driverId_idx" ON "DriverDocument"("driverId");

-- CreateIndex
CREATE INDEX "DriverSubscription_driverId_idx" ON "DriverSubscription"("driverId");

-- CreateIndex
CREATE INDEX "DriverSubscription_status_expire_idx" ON "DriverSubscription"("status", "expire");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_licensePlate_key" ON "vehicle"("licensePlate");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_driverId_key" ON "vehicle"("driverId");

-- CreateIndex
CREATE INDEX "vehicle_isActive_isAvailable_idx" ON "vehicle"("isActive", "isAvailable");

-- CreateIndex
CREATE INDEX "vehicle_currentZoneId_idx" ON "vehicle"("currentZoneId");

-- CreateIndex
CREATE INDEX "vehicle_isInService_idx" ON "vehicle"("isInService");

-- CreateIndex
CREATE INDEX "Ride_status_createdAt_idx" ON "Ride"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Ride_driverId_status_idx" ON "Ride"("driverId", "status");

-- CreateIndex
CREATE INDEX "Ride_userId_status_idx" ON "Ride"("userId", "status");

-- CreateIndex
CREATE INDEX "Ride_zoneId_idx" ON "Ride"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "User_city_idx" ON "User"("city");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_rideId_key" ON "Payment"("rideId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_driverId_status_idx" ON "Payment"("driverId", "status");

-- CreateIndex
CREATE INDEX "Payment_userId_status_idx" ON "Payment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "driver_location_driverId_key" ON "driver_location"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_location_vehicleId_key" ON "driver_location"("vehicleId");

-- CreateIndex
CREATE INDEX "driver_location_driverId_timestamp_idx" ON "driver_location"("driverId", "timestamp");

-- CreateIndex
CREATE INDEX "driver_location_latitude_longitude_idx" ON "driver_location"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "driver_location_timestamp_idx" ON "driver_location"("timestamp");

-- CreateIndex
CREATE INDEX "driver_location_isOnline_isAvailable_idx" ON "driver_location"("isOnline", "isAvailable");

-- CreateIndex
CREATE INDEX "user_location_latitude_longitude_idx" ON "user_location"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "user_location_userId_isActive_idx" ON "user_location"("userId", "isActive");

-- CreateIndex
CREATE INDEX "user_location_userId_isFrequentlyUsed_idx" ON "user_location"("userId", "isFrequentlyUsed");

-- CreateIndex
CREATE UNIQUE INDEX "driver_status_driverId_key" ON "driver_status"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "ride_request_requestId_key" ON "ride_request"("requestId");

-- CreateIndex
CREATE INDEX "ride_request_status_requestedAt_idx" ON "ride_request"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "ride_request_pickupLatitude_pickupLongitude_idx" ON "ride_request"("pickupLatitude", "pickupLongitude");

-- CreateIndex
CREATE INDEX "ride_request_userId_status_idx" ON "ride_request"("userId", "status");

-- CreateIndex
CREATE INDEX "ride_request_requestedAt_idx" ON "ride_request"("requestedAt");

-- CreateIndex
CREATE INDEX "driver_ride_requests_rideRequestId_sentAt_idx" ON "driver_ride_requests"("rideRequestId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "driver_ride_requests_driverId_rideRequestId_key" ON "driver_ride_requests"("driverId", "rideRequestId");

-- CreateIndex
CREATE INDEX "ServiceZone_city_isActive_idx" ON "ServiceZone"("city", "isActive");

-- CreateIndex
CREATE INDEX "ServiceZone_demandLevel_isActive_idx" ON "ServiceZone"("demandLevel", "isActive");

-- CreateIndex
CREATE INDEX "trip_log_bookingId_timestamp_idx" ON "trip_log"("bookingId", "timestamp");

-- CreateIndex
CREATE INDEX "trip_log_timestamp_idx" ON "trip_log"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "booking_rideRequestId_key" ON "booking"("rideRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_vehicleId_key" ON "booking"("vehicleId");

-- CreateIndex
CREATE INDEX "booking_driverId_status_idx" ON "booking"("driverId", "status");

-- CreateIndex
CREATE INDEX "booking_userId_status_idx" ON "booking"("userId", "status");

-- CreateIndex
CREATE INDEX "booking_status_idx" ON "booking"("status");

-- CreateIndex
CREATE INDEX "booking_vehicleId_idx" ON "booking"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "Wallet_userId_isActive_idx" ON "Wallet"("userId", "isActive");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSubscription" ADD CONSTRAINT "DriverSubscription_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_currentZoneId_fkey" FOREIGN KEY ("currentZoneId") REFERENCES "ServiceZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "ServiceZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_location" ADD CONSTRAINT "driver_location_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_location" ADD CONSTRAINT "driver_location_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_location" ADD CONSTRAINT "user_location_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_status" ADD CONSTRAINT "driver_status_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_request" ADD CONSTRAINT "ride_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_request" ADD CONSTRAINT "ride_request_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_ride_requests" ADD CONSTRAINT "driver_ride_requests_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_ride_requests" ADD CONSTRAINT "driver_ride_requests_rideRequestId_fkey" FOREIGN KEY ("rideRequestId") REFERENCES "ride_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_log" ADD CONSTRAINT "trip_log_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_rideRequestId_fkey" FOREIGN KEY ("rideRequestId") REFERENCES "ride_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
