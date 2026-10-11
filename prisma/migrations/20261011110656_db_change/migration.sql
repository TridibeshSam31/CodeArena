-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "executionTimeMs" INTEGER,
ADD COLUMN     "exitCode" INTEGER,
ADD COLUMN     "problemId" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "verdict" TEXT;
