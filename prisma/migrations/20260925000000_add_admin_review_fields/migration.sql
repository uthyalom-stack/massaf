-- Redefine Review table to make customerId optional and add authorName and source columns in SQLite
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "therapistId" TEXT NOT NULL,
    "bookingId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "authorName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Review" ("bookingId", "comment", "createdAt", "customerId", "id", "isPublished", "rating", "status", "therapistId", "updatedAt")
SELECT "bookingId", "comment", "createdAt", "customerId", "id", "isPublished", "rating", "status", "therapistId", "updatedAt" FROM "Review";

DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";

CREATE UNIQUE INDEX IF NOT EXISTS "Review_bookingId_key" ON "Review"("bookingId");
CREATE INDEX IF NOT EXISTS "Review_therapistId_idx" ON "Review"("therapistId");
CREATE INDEX IF NOT EXISTS "Review_customerId_idx" ON "Review"("customerId");
CREATE INDEX IF NOT EXISTS "Review_isPublished_idx" ON "Review"("isPublished");
CREATE INDEX IF NOT EXISTS "Review_source_idx" ON "Review"("source");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
