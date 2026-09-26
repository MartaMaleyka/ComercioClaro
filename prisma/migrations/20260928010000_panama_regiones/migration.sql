-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductUnit" ADD VALUE 'LB';
ALTER TYPE "ProductUnit" ADD VALUE 'OZ';
ALTER TYPE "ProductUnit" ADD VALUE 'GAL';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "deliveryZones" JSONB,
ADD COLUMN     "offlineDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "seniorDiscountRate" DECIMAL(5,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "countBreakdown" JSONB;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "creditDueDate" TIMESTAMP(3),
ADD COLUMN     "creditTerm" TEXT NOT NULL DEFAULT 'DAYS',
ADD COLUMN     "isSenior" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seniorId" TEXT;

-- AlterTable
ALTER TABLE "OnlineOrder" ADD COLUMN     "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryZone" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "seniorEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trackStock" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "seniorDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "seniorId" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "seniorDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;

