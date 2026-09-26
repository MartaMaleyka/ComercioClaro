-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'YAPPY';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "cardFeeRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'MX',
ADD COLUMN     "dv" TEXT,
ADD COLUMN     "ruc" TEXT,
ADD COLUMN     "showBalboa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transferFeeRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
ADD COLUMN     "usesFreeInvoicer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "yappyDirectory" TEXT,
ADD COLUMN     "yappyFeeRate" DECIMAL(6,4) NOT NULL DEFAULT 0.0107,
ADD COLUMN     "yappyQr" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "creditDays" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "dv" TEXT,
ADD COLUMN     "ruc" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "packSize" INTEGER;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "paymentReference" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'es';
