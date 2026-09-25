-- Non-destructive migration adding explicit isTest boolean markers to testable models

-- 1. Add isTest column to Customer
ALTER TABLE "Customer" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Customer_isTest_idx" ON "Customer"("isTest");

-- Mark existing test customer records
UPDATE "Customer" SET "isTest" = true WHERE "email" LIKE '%@test.com' OR "email" LIKE '%@example.com' OR "name" LIKE 'Test%' OR "name" LIKE 'Audit%';

-- 2. Add isTest column to Therapist
ALTER TABLE "Therapist" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Therapist_isTest_idx" ON "Therapist"("isTest");

-- Mark existing test therapist records
UPDATE "Therapist" SET "isTest" = true WHERE "email" LIKE '%@test.com' OR "email" LIKE '%@example.com' OR "name" LIKE 'Test%' OR "name" LIKE 'Audit%' OR "name" LIKE 'Scaling%' OR "name" LIKE 'Review Test%';

-- 3. Add isTest column to Booking
ALTER TABLE "Booking" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Booking_isTest_idx" ON "Booking"("isTest");

-- Mark existing test booking records
UPDATE "Booking" SET "isTest" = true WHERE "bookingNumber" LIKE 'PAY-%' OR "bookingNumber" LIKE 'TEST-%' OR "bookingNumber" LIKE 'AUDIT-%';

-- 4. Add isTest column to MarketingLink
ALTER TABLE "MarketingLink" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "MarketingLink_isTest_idx" ON "MarketingLink"("isTest");

-- Mark existing test marketing links
UPDATE "MarketingLink" SET "isTest" = true WHERE "code" LIKE 'audit_%' OR "code" LIKE 'test_%' OR "name" LIKE 'Test%';

-- 5. Add isTest column to Testimonial
ALTER TABLE "Testimonial" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Testimonial_isTest_idx" ON "Testimonial"("isTest");

-- Mark existing test testimonials
UPDATE "Testimonial" SET "isTest" = true WHERE "authorName" LIKE 'Promotional%' OR "authorName" LIKE 'Test%';

-- 6. Add isTest column to AdminNotification
ALTER TABLE "AdminNotification" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "AdminNotification_isTest_idx" ON "AdminNotification"("isTest");
