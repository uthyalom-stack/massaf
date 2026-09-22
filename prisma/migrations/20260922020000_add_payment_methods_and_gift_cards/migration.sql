-- CreateTable: GiftCardSubmission
CREATE TABLE IF NOT EXISTS "GiftCardSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "cardCode" TEXT NOT NULL,
    "declaredValue" REAL NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GiftCardSubmission_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GiftCardSubmission_bookingId_key" ON "GiftCardSubmission"("bookingId");
CREATE INDEX IF NOT EXISTS "GiftCardSubmission_status_idx" ON "GiftCardSubmission"("status");
CREATE INDEX IF NOT EXISTS "GiftCardSubmission_bookingId_idx" ON "GiftCardSubmission"("bookingId");
