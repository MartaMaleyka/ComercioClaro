-- CreateEnum
CREATE TYPE "OnlineOrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'READY', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "orderCounter" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OnlineOrder" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "OnlineOrderStatus" NOT NULL DEFAULT 'NEW',
    "customerName" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "fulfillment" TEXT NOT NULL DEFAULT 'PICKUP',
    "address" TEXT,
    "items" JSONB NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "saleId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlineOrder_saleId_key" ON "OnlineOrder"("saleId");

-- CreateIndex
CREATE INDEX "OnlineOrder_businessId_status_createdAt_idx" ON "OnlineOrder"("businessId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OnlineOrder_businessId_number_key" ON "OnlineOrder"("businessId", "number");

-- AddForeignKey
ALTER TABLE "OnlineOrder" ADD CONSTRAINT "OnlineOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineOrder" ADD CONSTRAINT "OnlineOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

