-- CreateTable
CREATE TABLE IF NOT EXISTS "GiftCardImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "giftCardSubmissionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiftCardImage_giftCardSubmissionId_fkey" FOREIGN KEY ("giftCardSubmissionId") REFERENCES "GiftCardSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GiftCardImage_giftCardSubmissionId_idx" ON "GiftCardImage"("giftCardSubmissionId");
