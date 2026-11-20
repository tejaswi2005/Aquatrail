CREATE TYPE "SubscriptionOccurrenceStatus" AS ENUM ('PENDING', 'GENERATED', 'FAILED', 'CANCELLED');

CREATE TABLE "SubscriptionOccurrence" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "SubscriptionOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionOccurrence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order"
    ADD COLUMN "subscriptionOccurrenceId" TEXT;

CREATE UNIQUE INDEX "Order_subscriptionOccurrenceId_key"
    ON "Order"("subscriptionOccurrenceId");

CREATE UNIQUE INDEX "SubscriptionOccurrence_subscriptionId_scheduledAt_key"
    ON "SubscriptionOccurrence"("subscriptionId", "scheduledAt");
CREATE INDEX "SubscriptionOccurrence_status_scheduledAt_idx"
    ON "SubscriptionOccurrence"("status", "scheduledAt");
CREATE INDEX "SubscriptionOccurrence_subscriptionId_scheduledAt_idx"
    ON "SubscriptionOccurrence"("subscriptionId", "scheduledAt");

ALTER TABLE "SubscriptionOccurrence"
    ADD CONSTRAINT "SubscriptionOccurrence_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_subscriptionOccurrenceId_fkey"
    FOREIGN KEY ("subscriptionOccurrenceId") REFERENCES "SubscriptionOccurrence"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
