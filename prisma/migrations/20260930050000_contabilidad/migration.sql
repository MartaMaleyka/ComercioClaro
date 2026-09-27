-- CreateEnum
CREATE TYPE "OwnerTransactionType" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL');

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "OwnerTransaction" (
    "id" TEXT NOT NULL,
    "type" "OwnerTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "cashSessionId" TEXT,
    "userId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerTransaction_businessId_date_idx" ON "OwnerTransaction"("businessId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_businessId_month_key" ON "AccountingPeriod"("businessId", "month");

-- AddForeignKey
ALTER TABLE "OwnerTransaction" ADD CONSTRAINT "OwnerTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Movimientos de caja que generó el sistema: sus asientos ya salen de la venta, compra o abono.
UPDATE "CashMovement" SET "source" = 'SALE_CANCEL' WHERE "reason" LIKE 'Cancelación de venta #%';
UPDATE "CashMovement" SET "source" = 'PURCHASE_CANCEL' WHERE "reason" LIKE 'Cancelación de compra #%';
UPDATE "CashMovement" SET "source" = 'SUPPLIER_PAYMENT_VOID' WHERE "reason" LIKE 'Abono a proveedor anulado%';
