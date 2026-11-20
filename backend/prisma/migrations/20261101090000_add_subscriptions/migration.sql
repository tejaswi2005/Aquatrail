CREATE TYPE "SubscriptionPackageType" AS ENUM ('MONTHLY', 'ALTERNATE_DAY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "DeliveryTimePreference" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "packageType" "SubscriptionPackageType" NOT NULL,
    "quantityPerDelivery" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextDeliveryDate" DATE NOT NULL,
    "nextBillingDate" DATE NOT NULL,
    "deliveryIntervalDays" INTEGER NOT NULL,
    "estimatedDeliveriesPerBillingCycle" INTEGER NOT NULL,
    "deliveryTimePreference" "DeliveryTimePreference" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "unitPricePaise" INTEGER NOT NULL,
    "perDeliveryAmountPaise" INTEGER NOT NULL,
    "estimatedMonthlyAmountPaise" INTEGER NOT NULL,
    "billingIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "billingCurrency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Subscription_customerId_status_idx" ON "Subscription"("customerId", "status");
CREATE INDEX "Subscription_status_nextDeliveryDate_idx" ON "Subscription"("status", "nextDeliveryDate");

ALTER TABLE "Subscription"
    ADD CONSTRAINT "Subscription_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription"
    ADD CONSTRAINT "Subscription_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Subscription"
    ADD CONSTRAINT "Subscription_addressId_fkey"
    FOREIGN KEY ("addressId") REFERENCES "Address"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
