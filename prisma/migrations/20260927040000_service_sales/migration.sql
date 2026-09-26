-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "serviceProviders" JSONB;

-- CreateTable
CREATE TABLE "ServiceSale" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "cashSessionId" TEXT,
    "userId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceSale_businessId_createdAt_idx" ON "ServiceSale"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceSale_cashSessionId_idx" ON "ServiceSale"("cashSessionId");

-- AddForeignKey
ALTER TABLE "ServiceSale" ADD CONSTRAINT "ServiceSale_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSale" ADD CONSTRAINT "ServiceSale_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

