import { SubscriptionStatus } from "@prisma/client";
import { addCalendarDays, dateKey, dateOnly } from "./subscriptionScheduleDates.js";

export function isSubscriptionSchedulable(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.ACTIVE;
}

export function isWithinSubscriptionPeriod(
  occurrenceDate: Date,
  startDate: Date,
  endDate: Date | null
): boolean {
  const date = dateOnly(occurrenceDate);
  return (
    dateKey(date) >= dateKey(startDate) &&
    (endDate === null || dateKey(date) <= dateKey(endDate))
  );
}

export function scheduledDatesBetween(
  startDate: Date,
  endDate: Date,
  intervalDays: number
): Date[] {
  if (!Number.isSafeInteger(intervalDays) || intervalDays < 1) {
    throw new RangeError("Delivery interval must be a positive whole number of days.");
  }

  const dates: Date[] = [];
  const endKey = dateKey(dateOnly(endDate));
  for (let cursor = dateOnly(startDate); dateKey(cursor) <= endKey; cursor = addCalendarDays(cursor, intervalDays)) {
    dates.push(cursor);
  }
  return dates;
}
