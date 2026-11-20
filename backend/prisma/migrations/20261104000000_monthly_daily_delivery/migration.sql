DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Subscription"
    WHERE "packageType" = 'MONTHLY'
      AND "status" IN ('ACTIVE', 'PAUSED')
      AND "perDeliveryAmountPaise"::bigint * 30 > 2147483647
  ) THEN
    RAISE EXCEPTION
      'Monthly subscription estimates exceed the supported integer range; resolve these records before changing the delivery frequency.';
  END IF;
END $$;

UPDATE "Subscription"
SET
  "deliveryIntervalDays" = 1,
  "estimatedDeliveriesPerBillingCycle" = 30,
  "estimatedMonthlyAmountPaise" = ("perDeliveryAmountPaise"::bigint * 30)::integer,
  "nextDeliveryDate" = CASE
    WHEN "status" = 'ACTIVE' THEN GREATEST("startDate", CURRENT_DATE)
    ELSE "nextDeliveryDate"
  END
WHERE "packageType" = 'MONTHLY'
  AND "status" IN ('ACTIVE', 'PAUSED');
