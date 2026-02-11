-- CreateTable
CREATE TABLE "driver_emergency_contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "relationship" TEXT,
    "driverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_emergency_contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_emergency_contact_driverId_idx" ON "driver_emergency_contact"("driverId");

-- AddForeignKey
ALTER TABLE "driver_emergency_contact" ADD CONSTRAINT "driver_emergency_contact_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
