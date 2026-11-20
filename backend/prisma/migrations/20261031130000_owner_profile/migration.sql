CREATE TABLE "OwnerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL DEFAULT '',
    "shopNumber" TEXT,
    "shopType" TEXT,
    "shopPhone" TEXT,
    "shopAddress" TEXT NOT NULL DEFAULT '',
    "landmark" TEXT,
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "pinCode" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "businessRegistrationNumber" TEXT,
    "licenseType" TEXT,
    "licenseNumber" TEXT,
    "issuingAuthority" TEXT,
    "licenseIssueDate" DATE,
    "licenseExpiryDate" DATE,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "waterTypes" TEXT,
    "deliveryAvailable" BOOLEAN NOT NULL DEFAULT false,
    "serviceAreas" TEXT,
    "openingTime" TEXT,
    "closingTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwnerProfile_userId_key" ON "OwnerProfile"("userId");

ALTER TABLE "OwnerProfile"
ADD CONSTRAINT "OwnerProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
