-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('QUINCENAL', 'MENSUAL');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PAID');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "payrollSettings" JSONB;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "payrollRunId" TEXT;

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idNumber" TEXT,
    "socialSecurityNumber" TEXT,
    "position" TEXT,
    "salary" DECIMAL(12,2) NOT NULL,
    "frequency" "PayFrequency" NOT NULL DEFAULT 'QUINCENAL',
    "hireDate" TIMESTAMP(3) NOT NULL,
    "vacationSince" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "terminatedAt" TIMESTAMP(3),
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "frequency" "PayFrequency" NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "paidMethod" "PaymentMethod",
    "contributionsPaidAt" TIMESTAMP(3),
    "gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "employerCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "userId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "salary" DECIMAL(12,2) NOT NULL,
    "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overtime" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "thirteenth" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gross" DECIMAL(12,2) NOT NULL,
    "cssEmployee" DECIMAL(12,2) NOT NULL,
    "eduEmployee" DECIMAL(12,2) NOT NULL,
    "incomeTax" DECIMAL(12,2) NOT NULL,
    "advances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(12,2) NOT NULL,
    "cssEmployer" DECIMAL(12,2) NOT NULL,
    "eduEmployer" DECIMAL(12,2) NOT NULL,
    "riskEmployer" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryAdvance" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "employeeId" TEXT NOT NULL,
    "runId" TEXT,
    "cashSessionId" TEXT,
    "userId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_businessId_active_idx" ON "Employee"("businessId", "active");

-- CreateIndex
CREATE INDEX "PayrollRun_businessId_periodEnd_idx" ON "PayrollRun"("businessId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_businessId_frequency_periodStart_key" ON "PayrollRun"("businessId", "frequency", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_runId_employeeId_key" ON "PayrollLine"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "SalaryAdvance_employeeId_runId_idx" ON "SalaryAdvance"("employeeId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_payrollRunId_key" ON "Expense"("payrollRunId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

