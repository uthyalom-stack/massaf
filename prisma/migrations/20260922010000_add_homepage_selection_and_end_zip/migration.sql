-- AlterTable: Add isHomepageSelected to Therapist
ALTER TABLE "Therapist" ADD COLUMN "isHomepageSelected" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Therapist_isHomepageSelected_idx" ON "Therapist"("isHomepageSelected");

-- AlterTable: Add endZipCode to ServiceArea
ALTER TABLE "ServiceArea" ADD COLUMN "endZipCode" TEXT;
