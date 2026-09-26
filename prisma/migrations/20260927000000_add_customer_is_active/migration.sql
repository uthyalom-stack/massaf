-- Non-destructive migration adding isActive to Customer and checking missing columns
ALTER TABLE "Customer" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "Customer_isActive_idx" ON "Customer"("isActive");
