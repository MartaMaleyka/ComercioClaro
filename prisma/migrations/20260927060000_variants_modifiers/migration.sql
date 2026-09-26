-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "modifiers" JSONB,
ADD COLUMN     "variantGroup" TEXT,
ADD COLUMN     "variantLabel" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "modifiers" JSONB;

-- CreateIndex
CREATE INDEX "Product_businessId_variantGroup_idx" ON "Product"("businessId", "variantGroup");

