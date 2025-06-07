/*
  Warnings:

  - You are about to drop the column `address` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `bankDetails` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `dateOfBirth` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `firstName` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `gender` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `isAvailable` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `isVerified` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `lastName` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `licenseNumber` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `profileImage` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `rating` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `totalEarnings` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `totalRides` on the `Driver` table. All the data in the column will be lost.
  - Added the required column `name` to the `Driver` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Driver_city_isAvailable_idx";

-- DropIndex
DROP INDEX "Driver_isAvailable_isVerified_idx";

-- DropIndex
DROP INDEX "Driver_licenseNumber_key";

-- AlterTable
ALTER TABLE "Driver" DROP COLUMN "address",
DROP COLUMN "bankDetails",
DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "dateOfBirth",
DROP COLUMN "firstName",
DROP COLUMN "gender",
DROP COLUMN "isAvailable",
DROP COLUMN "isVerified",
DROP COLUMN "lastName",
DROP COLUMN "licenseNumber",
DROP COLUMN "profileImage",
DROP COLUMN "rating",
DROP COLUMN "state",
DROP COLUMN "totalEarnings",
DROP COLUMN "totalRides",
ADD COLUMN     "name" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "DriverDetails" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
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

    CONSTRAINT "DriverDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverDetails_driverId_key" ON "DriverDetails"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverDetails_licenseNumber_key" ON "DriverDetails"("licenseNumber");

-- CreateIndex
CREATE INDEX "DriverDetails_isAvailable_isVerified_idx" ON "DriverDetails"("isAvailable", "isVerified");

-- CreateIndex
CREATE INDEX "DriverDetails_city_isAvailable_idx" ON "DriverDetails"("city", "isAvailable");

-- AddForeignKey
ALTER TABLE "DriverDetails" ADD CONSTRAINT "DriverDetails_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
