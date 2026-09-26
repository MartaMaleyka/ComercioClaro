-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'VOID');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'GIFT_CARD';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "giftCardId" TEXT;

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialAmount" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "customerName" TEXT,
    "expiresAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardTransaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "saleId" TEXT,
    "cashSessionId" TEXT,
    "giftCardId" TEXT NOT NULL,
    "userId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GiftCard_businessId_createdAt_idx" ON "GiftCard"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_businessId_code_key" ON "GiftCard"("businessId", "code");

-- CreateIndex
CREATE INDEX "GiftCardTransaction_giftCardId_createdAt_idx" ON "GiftCardTransaction"("giftCardId", "createdAt");

-- CreateIndex
CREATE INDEX "GiftCardTransaction_cashSessionId_idx" ON "GiftCardTransaction"("cashSessionId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

