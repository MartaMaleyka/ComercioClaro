-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusinessStatus" ADD VALUE 'PENDING';
ALTER TYPE "BusinessStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedReason" TEXT;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "requireSignupApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

