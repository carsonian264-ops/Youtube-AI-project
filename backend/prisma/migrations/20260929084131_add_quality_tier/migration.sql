-- CreateEnum
CREATE TYPE "QualityTier" AS ENUM ('DRAFT', 'STANDARD', 'HIGH');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "qualityTier" "QualityTier" NOT NULL DEFAULT 'STANDARD';
