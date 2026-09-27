-- CreateEnum
CREATE TYPE "SupplierBillStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "onCredit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tax" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "creditDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "SupplierBill" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "status" "SupplierBillStatus" NOT NULL DEFAULT 'OPEN',
    "supplierId" TEXT,
    "supplierName" TEXT,
    "purchaseId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "userId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "fromCash" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "billId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "userId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierBill_purchaseId_key" ON "SupplierBill"("purchaseId");

-- CreateIndex
CREATE INDEX "SupplierBill_businessId_status_dueDate_idx" ON "SupplierBill"("businessId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "SupplierBill_supplierId_idx" ON "SupplierBill"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayment_billId_idx" ON "SupplierPayment"("billId");

-- CreateIndex
CREATE INDEX "SupplierPayment_businessId_createdAt_idx" ON "SupplierPayment"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierPayment_cashSessionId_idx" ON "SupplierPayment"("cashSessionId");

-- AddForeignKey
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SupplierBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ITBMS/IVA de las compras anteriores: el costo incluye el impuesto con la tasa del producto.
UPDATE "Purchase" p SET "tax" = t.tax
FROM (
  SELECT pi."purchaseId", ROUND(SUM(pi."subtotal" * pr."taxRate" / (1 + pr."taxRate")), 2) AS tax
  FROM "PurchaseItem" pi JOIN "Product" pr ON pr."id" = pi."productId"
  GROUP BY pi."purchaseId"
) t
WHERE t."purchaseId" = p."id";
