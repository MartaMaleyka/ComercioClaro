-- CreateEnum
CREATE TYPE "OpenOrderStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "openOrderCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "restaurantMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sendToKitchen" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OpenOrder" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "OpenOrderStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "userId" TEXT,
    "saleId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenOrderItem" (
    "id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "modifiers" JSONB,
    "notes" TEXT,
    "sendToKitchen" BOOLEAN NOT NULL DEFAULT false,
    "kitchenStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpenOrder_saleId_key" ON "OpenOrder"("saleId");

-- CreateIndex
CREATE INDEX "OpenOrder_businessId_status_idx" ON "OpenOrder"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpenOrder_businessId_number_key" ON "OpenOrder"("businessId", "number");

-- CreateIndex
CREATE INDEX "OpenOrderItem_orderId_idx" ON "OpenOrderItem"("orderId");

-- AddForeignKey
ALTER TABLE "OpenOrder" ADD CONSTRAINT "OpenOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenOrder" ADD CONSTRAINT "OpenOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenOrderItem" ADD CONSTRAINT "OpenOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OpenOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenOrderItem" ADD CONSTRAINT "OpenOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

