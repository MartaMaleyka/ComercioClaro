-- CreateTable
CREATE TABLE "CustomerDisplay" (
    "id" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDisplay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerDisplay_businessId_updatedAt_idx" ON "CustomerDisplay"("businessId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDisplay_businessId_userId_key" ON "CustomerDisplay"("businessId", "userId");

-- AddForeignKey
ALTER TABLE "CustomerDisplay" ADD CONSTRAINT "CustomerDisplay_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

