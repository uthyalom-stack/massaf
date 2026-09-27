-- AlterTable
ALTER TABLE "Therapist" ADD COLUMN "overnightAvailable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Therapist" ADD COLUMN "overnightMultiplier" REAL NOT NULL DEFAULT 4.0;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "isOvernight" BOOLEAN NOT NULL DEFAULT false;
