import {
  DeliveryTimePreference,
  SubscriptionPackageType,
  SubscriptionOccurrenceStatus,
  SubscriptionStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  cancelUnassignedFutureSubscriptionOccurrences,
  createOrderWithInventoryReservation,
  OrderCreationError,
} from "./orderWorkflow.service.js";
import {
  addCalendarDays,
  dateKey,
  dateOnly,
  localDateKey,
  scheduledDateTime,
  startOfLocalDate,
} from "./subscriptionScheduleDates.js";
import { activeDriverForScheduledDate } from "./subscriptionAssignment.service.js";
import {
  isSubscriptionSchedulable,
  isWithinSubscriptionPeriod,
  scheduledDatesBetween,
} from "./subscriptionScheduleRules.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_TIME_ZONE = "Asia/Kolkata";

export interface SchedulerRunSummary {
  checkedSubscriptions: number;
  generatedDeliveries: number;
  failedOccurrences: number;
  skippedOccurrences: number;
  expiredSubscriptions: number;
}

interface SchedulerOptions {
  subscriptionId?: string;
  now?: Date;
}

interface SchedulerConfig {
  intervalMs: number;
  windowDays: number;
  timeZone: string;
}

type OccurrenceOutcome = "GENERATED" | "SKIPPED" | "FAILED" | "STOPPED";

interface OccurrenceResult {
  outcome: OccurrenceOutcome;
  nextDate: Date;
}

class SchedulingFailure extends Error {
  constructor(
    readonly reason:
      | "CUSTOMER_INACTIVE"
      | "ADDRESS_UNAVAILABLE"
      | "PRODUCT_UNAVAILABLE"
      | "INSUFFICIENT_STOCK"
      | "INVALID_PRICE"
  ) {
    super(reason);
    this.name = "SchedulingFailure";
  }
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error("Invalid subscription scheduler configuration.");
  }
  return parsed;
}

function intervalForPackage(packageType: SubscriptionPackageType): number {
  return packageType === SubscriptionPackageType.DAILY ? 1 : 2;
}

export function getSubscriptionSchedulerConfig(): SchedulerConfig {
  const config = {
    intervalMs: positiveInteger(
      process.env.SUBSCRIPTION_SCHEDULER_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      86_400_000
    ),
    windowDays: positiveInteger(
      process.env.SUBSCRIPTION_SCHEDULER_WINDOW_DAYS,
      DEFAULT_WINDOW_DAYS,
      7
    ),
    timeZone:
      process.env.SUBSCRIPTION_TIME_ZONE?.trim() || DEFAULT_TIME_ZONE,
  };

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: config.timeZone });
  } catch {
    throw new Error("Invalid SUBSCRIPTION_TIME_ZONE configuration.");
  }

  return config;
}

async function lockSubscription(
  tx: Prisma.TransactionClient,
  subscriptionId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Subscription"
    WHERE "id" = ${subscriptionId}
    FOR UPDATE
  `;
  return rows.length > 0;
}

async function lockOccurrence(
  tx: Prisma.TransactionClient,
  occurrenceId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT "id"
    FROM "SubscriptionOccurrence"
    WHERE "id" = ${occurrenceId}
    FOR UPDATE
  `;
}

function nextCursorDate(date: Date, intervalDays: number): Date {
  return addCalendarDays(date, intervalDays);
}

function failureReason(error: unknown): string {
  if (error instanceof SchedulingFailure) {
    switch (error.reason) {
      case "CUSTOMER_INACTIVE":
        return "Customer account is inactive.";
      case "ADDRESS_UNAVAILABLE":
        return "Delivery address is unavailable or no longer belongs to this customer.";
      case "PRODUCT_UNAVAILABLE":
        return "Subscription product is inactive or unavailable.";
      case "INSUFFICIENT_STOCK":
        return "Insufficient inventory for this scheduled delivery.";
      case "INVALID_PRICE":
        return "Product price or order total is invalid.";
    }
  }

  if (error instanceof OrderCreationError) {
    if (error.code === "INSUFFICIENT_STOCK") {
      return "Insufficient inventory for this scheduled delivery.";
    }
    if (error.code === "INVALID_PRODUCTS") {
      return "Subscription product is inactive or unavailable.";
    }
    return "Product price or order total is invalid.";
  }

  return "Unexpected scheduling error. The scheduler will retry.";
}

async function recordOccurrenceFailure(
  subscriptionId: string,
  scheduledAt: Date,
  reason: string,
  now: Date
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const subscriptionExists = await lockSubscription(tx, subscriptionId);
    if (!subscriptionExists) return;

    const subscription = await tx.subscription.findUnique({
      where: { id: subscriptionId },
      select: { status: true },
    });

    const occurrence = await tx.subscriptionOccurrence.upsert({
      where: {
        subscriptionId_scheduledAt: { subscriptionId, scheduledAt },
      },
      create: {
        subscriptionId,
        scheduledAt,
        status:
          subscription?.status === SubscriptionStatus.ACTIVE
            ? SubscriptionOccurrenceStatus.PENDING
            : SubscriptionOccurrenceStatus.CANCELLED,
      },
      update: {},
      select: { id: true, status: true },
    });
    await lockOccurrence(tx, occurrence.id);

    const current = await tx.subscriptionOccurrence.findUnique({
      where: { id: occurrence.id },
      select: { status: true },
    });
    if (
      !current ||
      current.status === SubscriptionOccurrenceStatus.GENERATED ||
      current.status === SubscriptionOccurrenceStatus.CANCELLED
    ) {
      return;
    }

    const stillActive = subscription?.status === SubscriptionStatus.ACTIVE;
    await tx.subscriptionOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: stillActive
          ? SubscriptionOccurrenceStatus.FAILED
          : SubscriptionOccurrenceStatus.CANCELLED,
        failureReason: stillActive ? reason : null,
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
      },
    });
  });
}

async function processOccurrence(
  subscriptionId: string,
  scheduledAt: Date,
  now: Date,
  timeZone: string
): Promise<OccurrenceResult> {
  const occurrenceDate = dateOnly(scheduledAt);
  const scheduledDateKey = dateKey(occurrenceDate);

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (!(await lockSubscription(tx, subscriptionId))) {
        return { outcome: "STOPPED" as const, nextDate: occurrenceDate };
      }

      const subscription = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          customer: { include: { user: { select: { isActive: true } } } },
          product: true,
          address: true,
        },
      });

      if (!subscription || !isSubscriptionSchedulable(subscription.status)) {
        return { outcome: "STOPPED" as const, nextDate: occurrenceDate };
      }

      const currentCursor = dateOnly(subscription.nextDeliveryDate);
      const deliveryIntervalDays = intervalForPackage(subscription.packageType);
      if (dateKey(currentCursor) !== scheduledDateKey) {
        return { outcome: "SKIPPED" as const, nextDate: currentCursor };
      }

      const expectedAt = scheduledDateTime(
            occurrenceDate,
            subscription.deliveryTimePreference,
            timeZone
          );

          if (expectedAt < now) {
        let nextDate = nextCursorDate(
          currentCursor,
          deliveryIntervalDays
        );
        while (
          scheduledDateTime(
            nextDate,
            subscription.deliveryTimePreference,
            timeZone
          ) < now
        ) {
          nextDate = nextCursorDate(nextDate, deliveryIntervalDays);
        }
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { nextDeliveryDate: nextDate },
        });
        return { outcome: "SKIPPED" as const, nextDate };
      }

      if (!isWithinSubscriptionPeriod(occurrenceDate, subscription.startDate, subscription.endDate)) {
        return { outcome: "STOPPED" as const, nextDate: currentCursor };
      }

      const occurrence = await tx.subscriptionOccurrence.upsert({
        where: {
          subscriptionId_scheduledAt: {
            subscriptionId,
            scheduledAt,
          },
        },
        create: {
          subscriptionId,
          scheduledAt,
          status: SubscriptionOccurrenceStatus.PENDING,
        },
        update: {},
        select: { id: true },
      });
      await lockOccurrence(tx, occurrence.id);

      const currentOccurrence = await tx.subscriptionOccurrence.findUniqueOrThrow({
        where: { id: occurrence.id },
      });

      if (
        currentOccurrence.status === SubscriptionOccurrenceStatus.GENERATED ||
        currentOccurrence.status === SubscriptionOccurrenceStatus.CANCELLED
      ) {
        const nextDate = nextCursorDate(
          currentCursor,
          deliveryIntervalDays
        );
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { nextDeliveryDate: nextDate },
        });
        return { outcome: "SKIPPED" as const, nextDate };
      }

      if (!subscription.customer.user.isActive) {
        throw new SchedulingFailure("CUSTOMER_INACTIVE");
      }
      if (
        subscription.address.customerId !== subscription.customerId
      ) {
        throw new SchedulingFailure("ADDRESS_UNAVAILABLE");
      }
      if (!subscription.product.isActive) {
        throw new SchedulingFailure("PRODUCT_UNAVAILABLE");
      }

      await tx.subscriptionOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: SubscriptionOccurrenceStatus.PENDING,
          failureReason: null,
          attemptCount: { increment: 1 },
          lastAttemptAt: now,
        },
      });

      const assignedDriverId = await activeDriverForScheduledDate(
        tx,
        subscription.id,
        occurrenceDate
      );
      const order = await createOrderWithInventoryReservation(tx, {
        customerId: subscription.customerId,
        addressId: subscription.addressId,
        items: [
          {
            productId: subscription.productId,
            quantity: subscription.quantityPerDelivery,
          },
        ],
        notes: "Recurring subscription delivery",
        subscriptionOccurrenceId: occurrence.id,
        assignedDriverId,
      });

      const nextDate = nextCursorDate(
        currentCursor,
        deliveryIntervalDays
      );
      await tx.subscriptionOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: SubscriptionOccurrenceStatus.GENERATED,
          failureReason: null,
          generatedAt: now,
        },
      });
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { nextDeliveryDate: nextDate },
      });

      return { outcome: "GENERATED" as const, nextDate, orderId: order.id };
    });

    return result;
  } catch (error: unknown) {
    const reason = failureReason(error);
    try {
      await recordOccurrenceFailure(
        subscriptionId,
        scheduledAt,
        reason,
        now
      );
    } catch (recordError: unknown) {
      console.error(
        JSON.stringify({
          event: "subscription_occurrence_failure_recording_failed",
          subscriptionId,
          scheduledAt: scheduledAt.toISOString(),
          errorType:
            recordError instanceof Error ? recordError.name : "unknown",
        })
      );
    }
    console.error(
      JSON.stringify({
        event: "subscription_occurrence_failed",
        subscriptionId,
        scheduledAt: scheduledAt.toISOString(),
        reason,
        errorType: error instanceof Error ? error.name : "unknown",
      })
    );
    return { outcome: "FAILED", nextDate: occurrenceDate };
  }
}

async function expireEndedSubscriptions(
  today: Date,
  now: Date
): Promise<number> {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      endDate: { lt: today },
    },
    select: { id: true },
  });

  let expired = 0;
  for (const candidate of subscriptions) {
    await prisma.$transaction(async (tx) => {
      if (!(await lockSubscription(tx, candidate.id))) return;
      const subscription = await tx.subscription.findUnique({
        where: { id: candidate.id },
        select: { status: true, endDate: true },
      });
      if (
        !subscription ||
        subscription.status !== SubscriptionStatus.ACTIVE ||
        !subscription.endDate ||
        dateOnly(subscription.endDate) >= today
      ) {
        return;
      }

      await tx.subscription.update({
        where: { id: candidate.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });
      await cancelUnassignedFutureSubscriptionOccurrences(
        tx,
        candidate.id,
        now
      );
      expired += 1;
    });
  }
  return expired;
}

async function executeSchedulerRun(
  options: SchedulerOptions,
  config: SchedulerConfig
): Promise<SchedulerRunSummary> {
  const now = options.now ?? new Date();
  const todayKey = localDateKey(now, config.timeZone);
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const lastWindowDate = addCalendarDays(today, config.windowDays - 1);
  const horizonDate = dateOnly(lastWindowDate);
  const horizon = new Date(
    startOfLocalDate(
      dateKey(addCalendarDays(lastWindowDate, 1)),
      config.timeZone
    ).getTime() - 1
  );
  const expiredSubscriptions = await expireEndedSubscriptions(today, now);
  const candidates = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      startDate: { lte: horizonDate },
      nextDeliveryDate: { lte: horizonDate },
      ...(options.subscriptionId
        ? { id: options.subscriptionId }
        : {}),
    },
    select: {
      id: true,
      nextDeliveryDate: true,
      packageType: true,
      deliveryTimePreference: true,
      status: true,
    },
    orderBy: { nextDeliveryDate: "asc" },
  });

  const summary: SchedulerRunSummary = {
    checkedSubscriptions: candidates.length,
    generatedDeliveries: 0,
    failedOccurrences: 0,
    skippedOccurrences: 0,
    expiredSubscriptions,
  };

  for (const candidate of candidates) {
    let expectedCursor = dateOnly(candidate.nextDeliveryDate);
    const scheduledDates = scheduledDatesBetween(
      expectedCursor,
      horizonDate,
      intervalForPackage(candidate.packageType)
    );
    for (const occurrenceDate of scheduledDates) {
      if (dateKey(occurrenceDate) < dateKey(expectedCursor)) continue;
      if (dateKey(occurrenceDate) > dateKey(expectedCursor)) break;
      const scheduledAt = scheduledDateTime(
        occurrenceDate,
        candidate.deliveryTimePreference,
        config.timeZone
      );
      if (scheduledAt > horizon) break;

      const result = await processOccurrence(
        candidate.id,
        scheduledAt,
        now,
        config.timeZone
      );
      if (result.outcome === "FAILED") {
        summary.failedOccurrences += 1;
        break;
      }
      if (result.outcome === "STOPPED") break;
      if (result.outcome === "GENERATED") {
        summary.generatedDeliveries += 1;
      } else {
        summary.skippedOccurrences += 1;
      }
      if (dateKey(result.nextDate) <= dateKey(occurrenceDate)) break;
      expectedCursor = dateOnly(result.nextDate);
      if (dateKey(expectedCursor) > dateKey(horizonDate)) break;
    }
  }

  return summary;
}

let activeRun: Promise<SchedulerRunSummary> | null = null;
let schedulerTimer: NodeJS.Timeout | null = null;

export function runSubscriptionScheduler(
  options: SchedulerOptions = {}
): Promise<SchedulerRunSummary> {
  if (activeRun) return activeRun;
  const config = getSubscriptionSchedulerConfig();
  activeRun = executeSchedulerRun(options, config).finally(() => {
    activeRun = null;
  });
  return activeRun;
}

export function startSubscriptionScheduler(): void {
  if (schedulerTimer) return;
  const config = getSubscriptionSchedulerConfig();

  const run = () => {
    void runSubscriptionScheduler().catch((error: unknown) => {
      console.error(
        JSON.stringify({
          event: "subscription_scheduler_run_failed",
          errorType: error instanceof Error ? error.name : "unknown",
        })
      );
    });
  };

  schedulerTimer = setInterval(run, config.intervalMs);
  run();
}

export function getSchedulerWindow(now = new Date()) {
  const { windowDays, timeZone } = getSubscriptionSchedulerConfig();
  const start = localDateKey(now, timeZone);
  const today = new Date(`${start}T00:00:00.000Z`);
  const lastWindowDate = addCalendarDays(today, windowDays - 1);
  const horizonDate = dateKey(lastWindowDate);
  const end = new Date(
    startOfLocalDate(
      dateKey(addCalendarDays(lastWindowDate, 1)),
      timeZone
    ).getTime() - 1
  );
  return {
    now,
    end,
    todayDate: today,
    todayStart: startOfLocalDate(start, timeZone),
    tomorrowStart: startOfLocalDate(
      dateKey(addCalendarDays(new Date(`${start}T00:00:00.000Z`), 1)),
      timeZone
    ),
    horizonDate,
    timeZone,
    windowDays,
  };
}
