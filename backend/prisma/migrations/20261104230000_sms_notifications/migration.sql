CREATE TYPE "NotificationType" AS ENUM (
  'SUBSCRIPTION_CONFIRMED',
  'DELIVERY_STARTED',
  'DELIVERY_COMPLETED',
  'DELIVERY_CANCELLED'
);

CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "orderId" TEXT,
  "subscriptionId" TEXT,
  "providerReference" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Notification_subscriptionId_fkey" FOREIGN KEY ("subscriptionId")
    REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Notification_eventKey_key" ON "Notification"("eventKey");
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");
CREATE INDEX "Notification_orderId_type_idx" ON "Notification"("orderId", "type");
CREATE INDEX "Notification_subscriptionId_type_idx" ON "Notification"("subscriptionId", "type");
