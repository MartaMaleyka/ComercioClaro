-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_IN';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "purchaseOrderCounter" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "purchaseOrderId" TEXT;

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "supplierId" TEXT,
    "supplierName" TEXT,
    "notes" TEXT,
    "expectedAt" TIMESTAMP(3),
    "total" DECIMAL(12,2) NOT NULL,
    "userId" TEXT,
    "sentAt" TIMESTAMP(3),
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "receivedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "notes" TEXT,
    "fromBusinessId" TEXT NOT NULL,
    "toBusinessId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "sku" TEXT,
    "unit" "ProductUnit" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL,
    "destProductId" TEXT,

    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrder_businessId_status_createdAt_idx" ON "PurchaseOrder"("businessId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_businessId_folio_key" ON "PurchaseOrder"("businessId", "folio");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_orderId_idx" ON "PurchaseOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "StockTransfer_fromBusinessId_createdAt_idx" ON "StockTransfer"("fromBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_toBusinessId_status_idx" ON "StockTransfer"("toBusinessId", "status");

-- CreateIndex
CREATE INDEX "StockTransferLine_transferId_idx" ON "StockTransferLine"("transferId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromBusinessId_fkey" FOREIGN KEY ("fromBusinessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toBusinessId_fkey" FOREIGN KEY ("toBusinessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

