-- CreateTable
CREATE TABLE IF NOT EXISTS "USZipCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zipCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "USZipCode_zipCode_key" ON "USZipCode"("zipCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "USZipCode_zipCode_idx" ON "USZipCode"("zipCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "USZipCode_state_idx" ON "USZipCode"("state");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "USZipCode_city_idx" ON "USZipCode"("city");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "USZipCode_state_zipCode_idx" ON "USZipCode"("state", "zipCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "USZipCode_state_city_idx" ON "USZipCode"("state", "city");
