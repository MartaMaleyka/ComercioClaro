-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "onboardingDismissedAt" TIMESTAMP(3),
ADD COLUMN     "signupSource" TEXT,
ADD COLUMN     "trialNoticeFor" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifyExpires" TIMESTAMP(3),
ADD COLUMN     "emailVerifyHash" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerifyHash_key" ON "User"("emailVerifyHash");


-- Los usuarios que ya existían no pasaron por la confirmación: se dan por confirmados.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
