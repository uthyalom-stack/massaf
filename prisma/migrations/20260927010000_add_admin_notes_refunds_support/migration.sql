-- Create missing tables and columns to sync migrations with schema.prisma

-- Create AdminNote table
CREATE TABLE IF NOT EXISTS "AdminNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorEmail" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "AdminNote_entityType_entityId_idx" ON "AdminNote"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AdminNote_createdAt_idx" ON "AdminNote"("createdAt");

-- Create RefundRecord table
CREATE TABLE IF NOT EXISTS "RefundRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT NOT NULL,
    "processedBy" TEXT,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RefundRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RefundRecord_bookingId_idx" ON "RefundRecord"("bookingId");
CREATE INDEX IF NOT EXISTS "RefundRecord_status_idx" ON "RefundRecord"("status");

-- Create SupportRequest table
CREATE TABLE IF NOT EXISTS "SupportRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "bookingReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SupportRequest_customerId_idx" ON "SupportRequest"("customerId");
CREATE INDEX IF NOT EXISTS "SupportRequest_status_idx" ON "SupportRequest"("status");
CREATE INDEX IF NOT EXISTS "SupportRequest_createdAt_idx" ON "SupportRequest"("createdAt");
