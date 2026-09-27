-- CreateEnum
CREATE TYPE "SubscriptionChargeKind" AS ENUM ('CHECKOUT', 'RENEWAL');

-- CreateEnum
CREATE TYPE "SubscriptionChargeStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billingCardLabel" TEXT,
ADD COLUMN     "billingCustomerId" TEXT,
ADD COLUMN     "billingFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "billingMethodId" TEXT,
ADD COLUMN     "nextChargeAt" TIMESTAMP(3),
ADD COLUMN     "renewalNoticeFor" TIMESTAMP(3),
ADD COLUMN     "suspendedByBilling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspensionNoticeFor" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubscriptionCharge" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT,
    "kind" "SubscriptionChargeKind" NOT NULL,
    "status" "SubscriptionChargeStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "months" INTEGER NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "externalId" TEXT,
    "error" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "retryIntervalDays" INTEGER NOT NULL DEFAULT 2,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "noticeDays" INTEGER NOT NULL DEFAULT 3,
    "suspendManualPayers" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCharge_externalId_key" ON "SubscriptionCharge"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCharge_paymentId_key" ON "SubscriptionCharge"("paymentId");

-- CreateIndex
CREATE INDEX "SubscriptionCharge_businessId_createdAt_idx" ON "SubscriptionCharge"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionCharge_status_createdAt_idx" ON "SubscriptionCharge"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

