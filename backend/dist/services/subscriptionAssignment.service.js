import { DeliveryStatus, OrderStatus, SubscriptionStatus, } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { localDateKey } from "./subscriptionScheduleDates.js";
export class SubscriptionAssignmentError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = "SubscriptionAssignmentError";
    }
}
function day(value, amount) {
    const result = new Date(value);
    result.setUTCDate(result.getUTCDate() + amount);
    return result;
}
function todayDate() {
    const timeZone = process.env.SUBSCRIPTION_TIME_ZONE?.trim() || "Asia/Kolkata";
    return new Date(`${localDateKey(new Date(), timeZone)}T00:00:00.000Z`);
}
async function lockSubscription(tx, subscriptionId) {
    const rows = await tx.$queryRaw `
    SELECT "id" FROM "Subscription" WHERE "id" = ${subscriptionId} FOR UPDATE
  `;
    if (!rows.length) {
        throw new SubscriptionAssignmentError(404, "Subscription not found.");
    }
}
async function updateGeneratedDeliveryDrivers(tx, input) {
    const deliveries = await tx.delivery.findMany({
        where: {
            status: DeliveryStatus.PENDING,
            order: {
                is: {
                    status: OrderStatus.PENDING,
                    subscriptionOccurrence: {
                        is: {
                            subscriptionId: input.subscriptionId,
                            scheduledAt: {
                                gte: input.startDate,
                                lt: day(input.endDate, 1),
                            },
                        },
                    },
                },
            },
            ...(input.driverId
                ? {
                    OR: [
                        { driverId: { not: input.driverId } },
                        { driverId: null },
                    ],
                }
                : { driverId: { not: null } }),
        },
        select: { id: true, driverId: true, orderId: true },
    });
    for (const delivery of deliveries) {
        await tx.delivery.update({
            where: { id: delivery.id },
            data: { driverId: input.driverId },
        });
        await tx.order.update({
            where: { id: delivery.orderId },
            data: { status: OrderStatus.PENDING },
        });
    }
}
const assignmentInclude = {
    driver: {
        include: { user: { select: { name: true, phone: true, isActive: true } } },
    },
    subscription: {
        include: {
            customer: { include: { user: { select: { name: true, phone: true } } } },
            product: { select: { name: true } },
        },
    },
};
export async function activeDriverForScheduledDate(tx, subscriptionId, scheduledDate) {
    const assignment = await tx.subscriptionDriverAssignment.findFirst({
        where: {
            subscriptionId,
            startDate: { lte: scheduledDate },
            endDate: { gte: scheduledDate },
            driver: { user: { isActive: true } },
        },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        select: { driverId: true },
    });
    return assignment?.driverId ?? null;
}
export async function createSubscriptionDriverAssignment(input) {
    return prisma.$transaction(async (tx) => {
        await lockSubscription(tx, input.subscriptionId);
        const subscription = await tx.subscription.findUniqueOrThrow({
            where: { id: input.subscriptionId },
            select: { startDate: true, endDate: true, status: true },
        });
        if (subscription.status !== SubscriptionStatus.ACTIVE &&
            subscription.status !== SubscriptionStatus.PAUSED) {
            throw new SubscriptionAssignmentError(409, "Only active or paused subscriptions can have a driver assignment.");
        }
        if (input.startDate < todayDate() ||
            input.startDate < subscription.startDate ||
            (subscription.endDate && input.endDate > subscription.endDate)) {
            throw new SubscriptionAssignmentError(400, "The assignment dates must be within the current or future subscription period.");
        }
        const driver = await tx.driverProfile.findFirst({
            where: { id: input.driverId, user: { isActive: true } },
            select: { id: true },
        });
        if (!driver) {
            throw new SubscriptionAssignmentError(404, "Choose an active driver.");
        }
        const overlapping = await tx.subscriptionDriverAssignment.findMany({
            where: {
                subscriptionId: input.subscriptionId,
                startDate: { lte: input.endDate },
                endDate: { gte: input.startDate },
            },
            select: { id: true, startDate: true, endDate: true },
        });
        for (const existing of overlapping) {
            if (existing.startDate < input.startDate) {
                await tx.subscriptionDriverAssignment.update({
                    where: { id: existing.id },
                    data: { endDate: day(input.startDate, -1) },
                });
            }
            else if (existing.startDate.getTime() === input.startDate.getTime()) {
                await tx.subscriptionDriverAssignment.update({
                    where: { id: existing.id },
                    data: { endDate: input.startDate },
                });
            }
            else {
                await tx.subscriptionDriverAssignment.delete({
                    where: { id: existing.id },
                });
            }
        }
        if (overlapping.length) {
            await updateGeneratedDeliveryDrivers(tx, {
                subscriptionId: input.subscriptionId,
                startDate: input.startDate,
                endDate: input.endDate,
                driverId: null,
            });
        }
        const assignment = await tx.subscriptionDriverAssignment.create({
            data: {
                subscriptionId: input.subscriptionId,
                driverId: input.driverId,
                startDate: input.startDate,
                endDate: input.endDate,
            },
            include: assignmentInclude,
        });
        await updateGeneratedDeliveryDrivers(tx, input);
        return assignment;
    });
}
