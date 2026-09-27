-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'MIXED';

-- CreateTable
CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "giftCardId" TEXT,
    "yappyChargeId" TEXT,
    "saleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalePayment_saleId_idx" ON "SalePayment"("saleId");

-- CreateIndex
CREATE INDEX "SalePayment_method_idx" ON "SalePayment"("method");

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Un pago por cada venta existente, con su forma de pago y su total: los cortes y reportes
-- anteriores dan los mismos resultados leyendo SalePayment.
INSERT INTO "SalePayment" ("id", "method", "amount", "reference", "giftCardId", "yappyChargeId", "saleId", "createdAt")
SELECT 'sp_' || s."id", s."paymentMethod", s."total", s."paymentReference", s."giftCardId", y."id", s."id", s."createdAt"
FROM "Sale" s
LEFT JOIN "YappyCharge" y ON y."saleId" = s."id";
