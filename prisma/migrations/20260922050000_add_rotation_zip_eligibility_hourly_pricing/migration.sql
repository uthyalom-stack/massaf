-- Non-destructive migration adding hourlyRate, TherapistZipEligibility, CustomerRotationHistory, and Booking pricing snapshot fields

-- 1. Add hourlyRate column to Therapist table
ALTER TABLE "Therapist" ADD COLUMN "hourlyRate" REAL NOT NULL DEFAULT 100.0;

-- 2. Add hourlyRateUsed and calculatedTotal columns to Booking table
ALTER TABLE "Booking" ADD COLUMN "hourlyRateUsed" REAL;
ALTER TABLE "Booking" ADD COLUMN "calculatedTotal" REAL;

-- 3. Create TherapistZipEligibility table
CREATE TABLE IF NOT EXISTS "TherapistZipEligibility" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "therapistId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "startZip" TEXT NOT NULL,
    "endZip" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TherapistZipEligibility_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TherapistZipEligibility_therapistId_idx" ON "TherapistZipEligibility"("therapistId");
CREATE INDEX IF NOT EXISTS "TherapistZipEligibility_state_idx" ON "TherapistZipEligibility"("state");
CREATE INDEX IF NOT EXISTS "TherapistZipEligibility_state_startZip_endZip_idx" ON "TherapistZipEligibility"("state", "startZip", "endZip");

-- 4. Create CustomerRotationHistory table
CREATE TABLE IF NOT EXISTS "CustomerRotationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "visitorSessionId" TEXT,
    "zipCode" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerRotationHistory_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerRotationHistory_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CustomerRotationHistory_customerId_zipCode_idx" ON "CustomerRotationHistory"("customerId", "zipCode");
CREATE INDEX IF NOT EXISTS "CustomerRotationHistory_visitorSessionId_zipCode_idx" ON "CustomerRotationHistory"("visitorSessionId", "zipCode");
CREATE INDEX IF NOT EXISTS "CustomerRotationHistory_therapistId_idx" ON "CustomerRotationHistory"("therapistId");
CREATE INDEX IF NOT EXISTS "CustomerRotationHistory_searchId_idx" ON "CustomerRotationHistory"("searchId");
CREATE INDEX IF NOT EXISTS "CustomerRotationHistory_seenAt_idx" ON "CustomerRotationHistory"("seenAt");
