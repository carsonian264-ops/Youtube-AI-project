-- CreateEnum
CREATE TYPE "MusicMood" AS ENUM ('NONE', 'UPBEAT', 'CALM', 'CINEMATIC', 'DRAMATIC');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "musicMood" "MusicMood" NOT NULL DEFAULT 'NONE';
