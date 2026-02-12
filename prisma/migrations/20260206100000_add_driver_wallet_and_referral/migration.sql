-- AlterTable
ALTER TABLE "driver" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "driver" ADD COLUMN "referredByDriverId" TEXT;
ALTER TABLE "SubscriptionPayment" ADD COLUMN "walletAmountUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "driver_wallet" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_wallet_transaction" (
    "id" TEXT NOT NULL,
    "driverWalletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceBefore" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_wallet_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_credit" (
    "id" TEXT NOT NULL,
    "refereeDriverId" TEXT NOT NULL,
    "referrerDriverId" TEXT NOT NULL,
    "subscriptionPaymentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_credit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_referralCode_key" ON "driver"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "driver_wallet_driverId_key" ON "driver_wallet"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_credit_refereeDriverId_key" ON "referral_credit"("refereeDriverId");

-- CreateIndex
CREATE INDEX "driver_wallet_transaction_driverWalletId_createdAt_idx" ON "driver_wallet_transaction"("driverWalletId", "createdAt");

-- AddForeignKey
ALTER TABLE "driver" ADD CONSTRAINT "driver_referredByDriverId_fkey" FOREIGN KEY ("referredByDriverId") REFERENCES "driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_wallet" ADD CONSTRAINT "driver_wallet_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_wallet_transaction" ADD CONSTRAINT "driver_wallet_transaction_driverWalletId_fkey" FOREIGN KEY ("driverWalletId") REFERENCES "driver_wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
