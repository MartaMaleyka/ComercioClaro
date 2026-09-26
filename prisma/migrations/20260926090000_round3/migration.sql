-- CreateEnum
CREATE TYPE "YappyChargeStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'BUY_X_PAY_Y', 'BUNDLE_PRICE');

-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('OPEN', 'APPLIED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "autoInvoice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalogEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalogSlug" TEXT,
ADD COLUMN     "catalogWhatsapp" TEXT,
ADD COLUMN     "einvoiceMode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "einvoiceProvider" TEXT,
ADD COLUMN     "invoicePerSale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loyaltyPointValue" DECIMAL(8,4) NOT NULL DEFAULT 0.01,
ADD COLUMN     "loyaltyPointsPerUnit" DECIMAL(8,2) NOT NULL DEFAULT 1,
ADD COLUMN     "yappyMode" TEXT NOT NULL DEFAULT 'STATIC';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "qrUrl" TEXT,
ADD COLUMN     "xmlUrl" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "pointsDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsRedeemed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "promotionDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "promotionId" TEXT;

-- CreateTable
CREATE TABLE "YappyCharge" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "phone" TEXT,
    "status" "YappyChargeStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerTxId" TEXT,
    "error" TEXT,
    "saleId" TEXT,
    "userId" TEXT,
    "businessId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YappyCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "percent" DECIMAL(5,4),
    "buyQty" INTEGER,
    "payQty" INTEGER,
    "bundleQty" INTEGER,
    "bundlePrice" DECIMAL(12,2),
    "productId" TEXT,
    "categoryId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "userId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "counted" DECIMAL(12,3) NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationFeedback" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "YappyCharge_orderId_key" ON "YappyCharge"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "YappyCharge_saleId_key" ON "YappyCharge"("saleId");

-- CreateIndex
CREATE INDEX "YappyCharge_businessId_createdAt_idx" ON "YappyCharge"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Promotion_businessId_active_idx" ON "Promotion"("businessId", "active");

-- CreateIndex
CREATE INDEX "InventoryCount_businessId_status_idx" ON "InventoryCount"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLine_countId_productId_key" ON "InventoryCountLine"("countId", "productId");

-- CreateIndex
CREATE INDEX "TranslationFeedback_language_createdAt_idx" ON "TranslationFeedback"("language", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Business_catalogSlug_key" ON "Business"("catalogSlug");

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YappyCharge" ADD CONSTRAINT "YappyCharge_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YappyCharge" ADD CONSTRAINT "YappyCharge_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

