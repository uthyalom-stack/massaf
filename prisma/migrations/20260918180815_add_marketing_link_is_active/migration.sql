-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Therapist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "profileImage" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "rating" REAL NOT NULL DEFAULT 0.0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "offersStudio" BOOLEAN NOT NULL DEFAULT true,
    "offersInHome" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TherapistPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "therapistId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TherapistPhoto_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TherapistService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "therapistId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "customPrice" REAL,
    "customDurationMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TherapistService_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TherapistService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TherapistAvailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "therapistId" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "specificDate" DATETIME,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TherapistAvailability_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "therapistId" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceArea_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "therapistId" TEXT,
    "serviceId" TEXT NOT NULL,
    "marketingLinkId" TEXT,
    "appointmentDateTime" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "locationType" TEXT NOT NULL DEFAULT 'STUDIO',
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" REAL NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_marketingLinkId_fkey" FOREIGN KEY ("marketingLinkId") REFERENCES "MarketingLink" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "bookingId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketingLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL DEFAULT '/',
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Therapist_email_key" ON "Therapist"("email");

-- CreateIndex
CREATE INDEX "Therapist_isActive_idx" ON "Therapist"("isActive");

-- CreateIndex
CREATE INDEX "Therapist_isFeatured_idx" ON "Therapist"("isFeatured");

-- CreateIndex
CREATE INDEX "TherapistPhoto_therapistId_idx" ON "TherapistPhoto"("therapistId");

-- CreateIndex
CREATE INDEX "Service_isActive_idx" ON "Service"("isActive");

-- CreateIndex
CREATE INDEX "TherapistService_therapistId_idx" ON "TherapistService"("therapistId");

-- CreateIndex
CREATE INDEX "TherapistService_serviceId_idx" ON "TherapistService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistService_therapistId_serviceId_key" ON "TherapistService"("therapistId", "serviceId");

-- CreateIndex
CREATE INDEX "TherapistAvailability_therapistId_idx" ON "TherapistAvailability"("therapistId");

-- CreateIndex
CREATE INDEX "TherapistAvailability_dayOfWeek_idx" ON "TherapistAvailability"("dayOfWeek");

-- CreateIndex
CREATE INDEX "TherapistAvailability_specificDate_idx" ON "TherapistAvailability"("specificDate");

-- CreateIndex
CREATE INDEX "ServiceArea_zipCode_idx" ON "ServiceArea"("zipCode");

-- CreateIndex
CREATE INDEX "ServiceArea_cityName_idx" ON "ServiceArea"("cityName");

-- CreateIndex
CREATE INDEX "ServiceArea_therapistId_zipCode_idx" ON "ServiceArea"("therapistId", "zipCode");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingNumber_key" ON "Booking"("bookingNumber");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- CreateIndex
CREATE INDEX "Booking_therapistId_idx" ON "Booking"("therapistId");

-- CreateIndex
CREATE INDEX "Booking_serviceId_idx" ON "Booking"("serviceId");

-- CreateIndex
CREATE INDEX "Booking_marketingLinkId_idx" ON "Booking"("marketingLinkId");

-- CreateIndex
CREATE INDEX "Booking_appointmentDateTime_idx" ON "Booking"("appointmentDateTime");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE INDEX "Review_therapistId_idx" ON "Review"("therapistId");

-- CreateIndex
CREATE INDEX "Review_customerId_idx" ON "Review"("customerId");

-- CreateIndex
CREATE INDEX "Review_isPublished_idx" ON "Review"("isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingLink_code_key" ON "MarketingLink"("code");

-- CreateIndex
CREATE INDEX "MarketingLink_code_idx" ON "MarketingLink"("code");

-- CreateIndex
CREATE INDEX "MarketingLink_isActive_idx" ON "MarketingLink"("isActive");
