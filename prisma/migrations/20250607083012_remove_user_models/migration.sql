/*
  Warnings:

  - You are about to drop the column `userId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Ride` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `booking` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ride_request` table. All the data in the column will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Wallet` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WalletTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_location` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `riderId` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `riderId` to the `Ride` table without a default value. This is not possible if the table is not empty.
  - Added the required column `riderId` to the `booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `riderId` to the `ride_request` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_userId_fkey";

-- DropForeignKey
ALTER TABLE "Ride" DROP CONSTRAINT "Ride_userId_fkey";

-- DropForeignKey
ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_userId_fkey";

-- DropForeignKey
ALTER TABLE "WalletTransaction" DROP CONSTRAINT "WalletTransaction_walletId_fkey";

-- DropForeignKey
ALTER TABLE "booking" DROP CONSTRAINT "booking_userId_fkey";

-- DropForeignKey
ALTER TABLE "ride_request" DROP CONSTRAINT "ride_request_userId_fkey";

-- DropForeignKey
ALTER TABLE "user_location" DROP CONSTRAINT "user_location_userId_fkey";

-- DropIndex
DROP INDEX "Payment_userId_status_idx";

-- DropIndex
DROP INDEX "Ride_userId_status_idx";

-- DropIndex
DROP INDEX "booking_userId_status_idx";

-- DropIndex
DROP INDEX "ride_request_userId_status_idx";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "userId",
ADD COLUMN     "riderId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Ride" DROP COLUMN "userId",
ADD COLUMN     "riderId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "booking" DROP COLUMN "userId",
ADD COLUMN     "riderId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ride_request" DROP COLUMN "userId",
ADD COLUMN     "riderId" TEXT NOT NULL;

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "Wallet";

-- DropTable
DROP TABLE "WalletTransaction";

-- DropTable
DROP TABLE "user_location";

-- CreateTable
CREATE TABLE "rider_info" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "profileImage" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRides" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_info_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rider_info_riderId_key" ON "rider_info"("riderId");

-- CreateIndex
CREATE INDEX "rider_info_riderId_idx" ON "rider_info"("riderId");

-- CreateIndex
CREATE INDEX "rider_info_phoneNumber_idx" ON "rider_info"("phoneNumber");

-- CreateIndex
CREATE INDEX "Payment_riderId_status_idx" ON "Payment"("riderId", "status");

-- CreateIndex
CREATE INDEX "Ride_riderId_status_idx" ON "Ride"("riderId", "status");

-- CreateIndex
CREATE INDEX "booking_riderId_status_idx" ON "booking"("riderId", "status");

-- CreateIndex
CREATE INDEX "ride_request_riderId_status_idx" ON "ride_request"("riderId", "status");

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_info"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_info"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_request" ADD CONSTRAINT "ride_request_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_info"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_info"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
