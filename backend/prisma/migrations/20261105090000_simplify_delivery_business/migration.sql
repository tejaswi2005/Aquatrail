BEGIN;

CREATE TYPE "DeliveryStatus_new" AS ENUM ('PENDING', 'STARTED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."Delivery" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Delivery"
  ALTER COLUMN "status" TYPE "DeliveryStatus_new"
  USING (
    CASE
      WHEN "status"::text IN ('FAILED', 'CANCELLED')
        OR "failedAt" IS NOT NULL
        OR "cancelledAt" IS NOT NULL THEN 'CANCELLED'
      WHEN "status"::text = 'DELIVERED' OR "deliveredAt" IS NOT NULL THEN 'COMPLETED'
      WHEN "status"::text IN ('PICKED_UP', 'IN_TRANSIT') OR "pickedUpAt" IS NOT NULL THEN 'STARTED'
      ELSE 'PENDING'
    END
  )::"DeliveryStatus_new";
ALTER TYPE "DeliveryStatus" RENAME TO "DeliveryStatus_old";
ALTER TYPE "DeliveryStatus_new" RENAME TO "DeliveryStatus";
DROP TYPE "public"."DeliveryStatus_old";
ALTER TABLE "Delivery" ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'STARTED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Order"
  ALTER COLUMN "status" TYPE "OrderStatus_new"
  USING (
    CASE "status"::text
      WHEN 'IN_DELIVERY' THEN 'STARTED'
      WHEN 'DELIVERED' THEN 'COMPLETED'
      WHEN 'CANCELLED' THEN 'CANCELLED'
      ELSE 'PENDING'
    END
  )::"OrderStatus_new";
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';

UPDATE "Order" AS "o"
SET "status" = "d"."status"::text::"OrderStatus"
FROM "Delivery" AS "d"
WHERE "d"."orderId" = "o"."id"
  AND "o"."status"::text <> "d"."status"::text;

CREATE TYPE "SubscriptionPackageType_new" AS ENUM ('DAILY', 'ALTERNATE_DAY');
ALTER TABLE "Subscription"
  ALTER COLUMN "packageType" TYPE "SubscriptionPackageType_new"
  USING (
    CASE "packageType"::text
      WHEN 'MONTHLY' THEN 'DAILY'
      ELSE 'ALTERNATE_DAY'
    END
  )::"SubscriptionPackageType_new";
ALTER TYPE "SubscriptionPackageType" RENAME TO "SubscriptionPackageType_old";
ALTER TYPE "SubscriptionPackageType_new" RENAME TO "SubscriptionPackageType";
DROP TYPE "public"."SubscriptionPackageType_old";

ALTER TABLE "Delivery"
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

UPDATE "Delivery"
SET
  "startedAt" = COALESCE("startedAt", "pickedUpAt"),
  "completedAt" = COALESCE("completedAt", "deliveredAt"),
  "cancelledAt" = COALESCE("cancelledAt", "failedAt"),
  "cancellationReason" = COALESCE("cancellationReason", "failureReason");

ALTER TABLE "Delivery"
  DROP COLUMN "deliveredAt",
  DROP COLUMN "failedAt",
  DROP COLUMN "failureReason",
  DROP COLUMN "pickedUpAt";

ALTER TABLE "DriverProfile" DROP COLUMN "availability";
DROP INDEX "Notification_status_createdAt_idx";
ALTER TABLE "Notification"
  DROP COLUMN "attemptCount",
  DROP COLUMN "attemptedAt";
ALTER TABLE "Subscription"
  DROP COLUMN "billingCurrency",
  DROP COLUMN "billingIntervalDays",
  DROP COLUMN "deliveryIntervalDays",
  DROP COLUMN "estimatedDeliveriesPerBillingCycle",
  DROP COLUMN "estimatedMonthlyAmountPaise",
  DROP COLUMN "nextBillingDate",
  DROP COLUMN "perDeliveryAmountPaise";

DROP INDEX "SubscriptionDriverAssignment_driverId_status_startDate_endDate_";
DROP INDEX "SubscriptionDriverAssignment_subscriptionId_status_startDate_en";
DROP INDEX "SubscriptionDriverAssignment_subscriptionId_period_active_key";
ALTER TABLE "SubscriptionDriverAssignment" DROP COLUMN "status";

ALTER TABLE "DriverLocation"
  DROP CONSTRAINT "DriverLocation_deliveryId_fkey";
ALTER TABLE "OwnerProfile"
  DROP CONSTRAINT "OwnerProfile_userId_fkey";
ALTER TABLE "RefreshToken"
  DROP CONSTRAINT "RefreshToken_userId_fkey";

DROP TABLE "DriverLocation";
DROP TABLE "OwnerProfile";
DROP TABLE "RefreshToken";

DROP TYPE "DriverAssignmentStatus";
DROP TYPE "DriverAvailability";

CREATE INDEX "SubscriptionDriverAssignment_subscriptionId_startDate_endDa_idx"
  ON "SubscriptionDriverAssignment"("subscriptionId", "startDate", "endDate");
CREATE INDEX "SubscriptionDriverAssignment_driverId_startDate_endDate_idx"
  ON "SubscriptionDriverAssignment"("driverId", "startDate", "endDate");

COMMIT;
