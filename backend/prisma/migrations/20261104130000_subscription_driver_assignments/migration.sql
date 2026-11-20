CREATE TYPE "DriverAssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');

CREATE TABLE "SubscriptionDriverAssignment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "DriverAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionDriverAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriptionDriverAssignment_date_range_check" CHECK ("endDate" >= "startDate")
);

CREATE INDEX "SubscriptionDriverAssignment_subscriptionId_status_startDate_endDate_idx"
    ON "SubscriptionDriverAssignment"("subscriptionId", "status", "startDate", "endDate");
CREATE INDEX "SubscriptionDriverAssignment_driverId_status_startDate_endDate_idx"
    ON "SubscriptionDriverAssignment"("driverId", "status", "startDate", "endDate");
CREATE UNIQUE INDEX "SubscriptionDriverAssignment_subscriptionId_period_active_key"
    ON "SubscriptionDriverAssignment"("subscriptionId", "startDate", "endDate")
    WHERE "status" = 'ACTIVE';

ALTER TABLE "SubscriptionDriverAssignment"
    ADD CONSTRAINT "SubscriptionDriverAssignment_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionDriverAssignment"
    ADD CONSTRAINT "SubscriptionDriverAssignment_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
