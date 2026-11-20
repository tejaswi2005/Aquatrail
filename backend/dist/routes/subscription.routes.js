import { Router } from "express";
import { DeliveryTimePreference, Prisma, SubscriptionPackageType, SubscriptionOccurrenceStatus, SubscriptionStatus, UserRole, } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { allowRoles, authenticate, } from "../middleware/auth.js";
import { getSubscriptionSchedulerConfig, runSubscriptionScheduler, } from "../services/subscriptionScheduler.service.js";
import { addCalendarDays, dateOnly as scheduleDateOnly, nextScheduleDate, scheduledDateTime, } from "../services/subscriptionScheduleDates.js";
import { cancelUnassignedFutureSubscriptionOccurrences } from "../services/orderWorkflow.service.js";
import { getSubscriptionProductAvailabilityError } from "../services/subscriptionStock.service.js";
const router = Router();
const SUBSCRIPTION_PERIOD_DAYS = 30;
const createSubscriptionSchema = z.object({
    packageType: z.nativeEnum(SubscriptionPackageType),
    productId: z.string().min(1),
    idempotencyKey: z.uuid(),
    quantityPerDelivery: z.number().int().min(1).max(100),
    startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Enter a valid start date"),
    deliveryTimePreference: z.nativeEnum(DeliveryTimePreference),
    addressId: z.string().min(1),
});
const updateSubscriptionStatusSchema = z.object({
    status: z.nativeEnum(SubscriptionStatus),
});
const estimateSubscriptionSchema = z.object({
    packageType: z.nativeEnum(SubscriptionPackageType),
    productId: z.string().min(1),
    quantityPerDelivery: z.number().int().min(1).max(100),
});
function dateOnly(value) {
    return new Date(`${value}T00:00:00.000Z`);
}
function dateString(value) {
    return value.toISOString().slice(0, 10);
}
function addDays(value, days) {
    const result = new Date(value);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}
function deliveriesPerBillingCycle(intervalDays) {
    return Math.ceil(SUBSCRIPTION_PERIOD_DAYS / intervalDays);
}
function intervalForPackage(packageType) {
    return packageType === SubscriptionPackageType.DAILY ? 1 : 2;
}
function getSubscriptionId(req) {
    const id = req.params.subscriptionId;
    return Array.isArray(id) ? id[0] : id;
}
function customerSubscriptionInclude(now) {
    const { windowDays } = getSubscriptionSchedulerConfig();
    return {
        product: { select: { name: true, bottleSizeLiters: true } },
        address: {
            select: {
                id: true,
                label: true,
                addressLine1: true,
                addressLine2: true,
                city: true,
                state: true,
                postalCode: true,
            },
        },
        occurrences: {
            where: {
                scheduledAt: {
                    gte: now,
                    lte: new Date(now.getTime() + windowDays * 86_400_000),
                },
                status: {
                    in: [
                        SubscriptionOccurrenceStatus.GENERATED,
                        SubscriptionOccurrenceStatus.FAILED,
                        SubscriptionOccurrenceStatus.PENDING,
                    ],
                },
            },
            include: {
                order: {
                    select: {
                        id: true,
                        orderNumber: true,
                        status: true,
                        delivery: {
                            select: {
                                id: true,
                                status: true,
                                driverId: true,
                                driver: {
                                    select: {
                                        user: { select: { name: true, phone: true } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { scheduledAt: "asc" },
            take: 10,
        },
    };
}
router.use(authenticate, allowRoles(UserRole.CUSTOMER));
router.post("/estimate", asyncHandler(async (req, res) => {
    const parsed = estimateSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid subscription estimate details",
            errors: parsed.error.flatten(),
        });
    }
    const product = await prisma.product.findFirst({
        where: {
            id: parsed.data.productId,
            isActive: true,
        },
        select: { pricePaise: true, stockQuantity: true },
    });
    if (!product) {
        return res.status(409).json({
            success: false,
            message: "The selected product is unavailable",
        });
    }
    const stockError = getSubscriptionProductAvailabilityError(product.stockQuantity, parsed.data.quantityPerDelivery);
    if (stockError === "PRODUCT_UNAVAILABLE") {
        return res.status(409).json({
            success: false,
            message: "The selected product is unavailable",
        });
    }
    if (stockError === "INSUFFICIENT_STOCK") {
        return res.status(409).json({
            success: false,
            message: "There is not enough stock for one delivery. Reduce the bottle quantity or choose another product.",
        });
    }
    if (product.pricePaise <= 0) {
        return res.status(409).json({
            success: false,
            message: "The selected product has an invalid price",
        });
    }
    const intervalDays = intervalForPackage(parsed.data.packageType);
    const estimatedDeliveries = deliveriesPerBillingCycle(intervalDays);
    const perDeliveryAmountPaise = product.pricePaise * parsed.data.quantityPerDelivery;
    const estimatedMonthlyAmountPaise = perDeliveryAmountPaise * estimatedDeliveries;
    if (product.pricePaise <= 0 ||
        !Number.isSafeInteger(perDeliveryAmountPaise) ||
        !Number.isSafeInteger(estimatedMonthlyAmountPaise) ||
        estimatedMonthlyAmountPaise > 2_147_483_647) {
        return res.status(400).json({
            success: false,
            message: "The estimated subscription price is invalid",
        });
    }
    return res.json({
        success: true,
        data: {
            unitPricePaise: product.pricePaise,
            perDeliveryAmountPaise,
            estimatedDeliveriesPerBillingCycle: estimatedDeliveries,
            estimatedMonthlyAmountPaise,
            billingIntervalDays: SUBSCRIPTION_PERIOD_DAYS,
        },
    });
}));
router.post("/", asyncHandler(async (req, res) => {
    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid subscription details",
            errors: parsed.error.flatten(),
        });
    }
    const startDate = dateOnly(parsed.data.startDate);
    const today = dateOnly(dateString(new Date()));
    const customer = await prisma.customerProfile.findUnique({
        where: { userId: req.user.id },
        select: { id: true },
    });
    if (!customer) {
        return res.status(403).json({
            success: false,
            message: "Customer profile required",
        });
    }
    const sameRequest = (subscription) => subscription.customerId === customer.id &&
        subscription.packageType === parsed.data.packageType &&
        subscription.productId === parsed.data.productId &&
        subscription.quantityPerDelivery === parsed.data.quantityPerDelivery &&
        dateString(subscription.startDate) === parsed.data.startDate &&
        subscription.deliveryTimePreference ===
            parsed.data.deliveryTimePreference &&
        subscription.addressId === parsed.data.addressId;
    const existing = await prisma.subscription.findUnique({
        where: { idempotencyKey: parsed.data.idempotencyKey },
        include: customerSubscriptionInclude(new Date()),
    });
    if (existing) {
        if (!sameRequest(existing)) {
            return res.status(409).json({
                success: false,
                message: "This request key has already been used for another subscription.",
            });
        }
        return res.json({ success: true, data: existing });
    }
    if (startDate < today) {
        return res.status(400).json({
            success: false,
            message: "The subscription start date cannot be in the past",
        });
    }
    const deliveryIntervalDays = intervalForPackage(parsed.data.packageType);
    const estimatedDeliveries = deliveriesPerBillingCycle(deliveryIntervalDays);
    const createSubscription = () => prisma.$transaction(async (tx) => {
        const [address, product] = await Promise.all([
            tx.address.findFirst({
                where: { id: parsed.data.addressId, customerId: customer.id },
                select: { id: true },
            }),
            tx.product.findFirst({
                where: {
                    id: parsed.data.productId,
                    isActive: true,
                },
                select: { id: true, pricePaise: true, stockQuantity: true },
            }),
        ]);
        if (!address) {
            return { error: "ADDRESS_NOT_FOUND" };
        }
        if (!product) {
            return { error: "PRODUCT_UNAVAILABLE" };
        }
        const stockError = getSubscriptionProductAvailabilityError(product.stockQuantity, parsed.data.quantityPerDelivery);
        if (stockError) {
            return { error: stockError };
        }
        const perDeliveryAmountPaise = product.pricePaise * parsed.data.quantityPerDelivery;
        const estimatedMonthlyAmountPaise = perDeliveryAmountPaise * estimatedDeliveries;
        if (!Number.isSafeInteger(perDeliveryAmountPaise) ||
            !Number.isSafeInteger(estimatedMonthlyAmountPaise) ||
            estimatedMonthlyAmountPaise > 2_147_483_647) {
            return { error: "INVALID_PRICE" };
        }
        return tx.subscription.create({
            data: {
                customerId: customer.id,
                productId: product.id,
                addressId: address.id,
                packageType: parsed.data.packageType,
                quantityPerDelivery: parsed.data.quantityPerDelivery,
                startDate,
                endDate: addDays(startDate, SUBSCRIPTION_PERIOD_DAYS - 1),
                nextDeliveryDate: startDate,
                deliveryTimePreference: parsed.data.deliveryTimePreference,
                status: SubscriptionStatus.ACTIVE,
                unitPricePaise: product.pricePaise,
                idempotencyKey: parsed.data.idempotencyKey,
            },
            include: {
                product: { select: { name: true, bottleSizeLiters: true } },
                address: {
                    select: {
                        id: true,
                        label: true,
                        addressLine1: true,
                        addressLine2: true,
                        city: true,
                        state: true,
                        postalCode: true,
                    },
                },
            },
        });
    });
    let subscription;
    try {
        subscription = await createSubscription();
    }
    catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002") {
            const winner = await prisma.subscription.findUnique({
                where: { idempotencyKey: parsed.data.idempotencyKey },
                include: customerSubscriptionInclude(new Date()),
            });
            if (winner && sameRequest(winner)) {
                return res.json({ success: true, data: winner });
            }
            return res.status(409).json({
                success: false,
                message: "This request key has already been used for another subscription.",
            });
        }
        throw error;
    }
    if ("error" in subscription) {
        const status = subscription.error === "ADDRESS_NOT_FOUND" ? 400 : 409;
        const message = subscription.error === "ADDRESS_NOT_FOUND"
            ? "Choose a valid delivery address"
            : subscription.error === "PRODUCT_UNAVAILABLE"
                ? "The selected product is unavailable"
                : subscription.error === "INSUFFICIENT_STOCK"
                    ? "There is not enough stock for one delivery. Reduce the bottle quantity or choose another product."
                    : "The estimated subscription price is invalid";
        return res.status(status).json({ success: false, message });
    }
    const response = res.status(201).json({ success: true, data: subscription });
    void runSubscriptionScheduler({ subscriptionId: subscription.id }).catch((error) => {
        console.error(JSON.stringify({
            event: "subscription_initial_schedule_failed",
            subscriptionId: subscription.id,
            errorType: error instanceof Error ? error.name : "unknown",
        }));
    });
    return response;
}));
router.get("/my", asyncHandler(async (req, res) => {
    const now = new Date();
    const subscriptions = await prisma.subscription.findMany({
        where: { customer: { userId: req.user.id } },
        include: customerSubscriptionInclude(now),
        orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: subscriptions });
}));
router.get("/:subscriptionId", asyncHandler(async (req, res) => {
    const now = new Date();
    const subscription = await prisma.subscription.findFirst({
        where: {
            id: getSubscriptionId(req),
            customer: { userId: req.user.id },
        },
        include: customerSubscriptionInclude(now),
    });
    if (!subscription) {
        return res.status(404).json({
            success: false,
            message: "Subscription not found",
        });
    }
    return res.json({ success: true, data: subscription });
}));
router.patch("/:subscriptionId/status", asyncHandler(async (req, res) => {
    const parsed = updateSubscriptionStatusSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid subscription status",
            errors: parsed.error.flatten(),
        });
    }
    const result = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw `
        SELECT "id"
        FROM "Subscription"
        WHERE "id" = ${getSubscriptionId(req)}
        FOR UPDATE
      `;
        if (locked.length === 0) {
            return { error: "NOT_FOUND" };
        }
        const subscription = await tx.subscription.findFirst({
            where: {
                id: getSubscriptionId(req),
                customer: { userId: req.user.id },
            },
        });
        if (!subscription) {
            return { error: "NOT_FOUND" };
        }
        const target = parsed.data.status;
        const alreadyAtTarget = subscription.status === target;
        const allowed = alreadyAtTarget ||
            (subscription.status === SubscriptionStatus.ACTIVE &&
                (target === SubscriptionStatus.PAUSED ||
                    target === SubscriptionStatus.CANCELLED)) ||
            (subscription.status === SubscriptionStatus.PAUSED &&
                (target === SubscriptionStatus.ACTIVE ||
                    target === SubscriptionStatus.CANCELLED));
        if (!allowed) {
            return { error: "INVALID_TRANSITION" };
        }
        if (alreadyAtTarget) {
            const current = await tx.subscription.findUnique({
                where: { id: subscription.id },
                include: customerSubscriptionInclude(new Date()),
            });
            return current
                ? { subscription: current }
                : { error: "NOT_FOUND" };
        }
        const today = dateOnly(dateString(new Date()));
        let nextDeliveryDate = subscription.nextDeliveryDate;
        if (target === SubscriptionStatus.ACTIVE) {
            if (subscription.endDate &&
                scheduleDateOnly(subscription.endDate) < today) {
                await tx.subscription.update({
                    where: { id: subscription.id },
                    data: { status: SubscriptionStatus.EXPIRED },
                });
                return { error: "EXPIRED" };
            }
            const timeZone = getSubscriptionSchedulerConfig().timeZone;
            const deliveryIntervalDays = intervalForPackage(subscription.packageType);
            const nextOccurrenceDate = nextScheduleDate(subscription.startDate, deliveryIntervalDays, subscription.deliveryTimePreference, new Date(), timeZone);
            nextDeliveryDate = nextOccurrenceDate;
            for (let attempt = 0; attempt < 10_000; attempt += 1) {
                const scheduledAt = scheduledDateTime(nextDeliveryDate, subscription.deliveryTimePreference, timeZone);
                const existing = await tx.subscriptionOccurrence.findUnique({
                    where: {
                        subscriptionId_scheduledAt: {
                            subscriptionId: subscription.id,
                            scheduledAt,
                        },
                    },
                    select: { id: true },
                });
                if (!existing)
                    break;
                nextDeliveryDate = addCalendarDays(nextDeliveryDate, deliveryIntervalDays);
            }
            if (subscription.endDate &&
                nextDeliveryDate > scheduleDateOnly(subscription.endDate)) {
                return { error: "NO_FUTURE_DELIVERY" };
            }
        }
        const updated = await tx.subscription.update({
            where: { id: subscription.id },
            data: { status: target, nextDeliveryDate },
            include: customerSubscriptionInclude(new Date()),
        });
        if (target === SubscriptionStatus.PAUSED ||
            target === SubscriptionStatus.CANCELLED) {
            await cancelUnassignedFutureSubscriptionOccurrences(tx, subscription.id, new Date());
        }
        return { subscription: updated };
    });
    if ("error" in result) {
        const notFound = result.error === "NOT_FOUND";
        return res.status(notFound ? 404 : 409).json({
            success: false,
            message: result.error === "EXPIRED"
                ? "This subscription has passed its end date and cannot be resumed"
                : result.error === "NO_FUTURE_DELIVERY"
                    ? "No scheduled delivery remains before this subscription's end date"
                    : notFound
                        ? "Subscription not found"
                        : "This subscription status transition is not allowed",
        });
    }
    return res.json({ success: true, data: result.subscription });
}));
export default router;
