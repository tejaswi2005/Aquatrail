import { Router } from "express";
import { DeliveryStatus, SubscriptionOccurrenceStatus, SubscriptionStatus, UserRole, } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { authenticate, allowRoles, } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getSchedulerWindow, runSubscriptionScheduler, } from "../services/subscriptionScheduler.service.js";
import { createSubscriptionDriverAssignment, } from "../services/subscriptionAssignment.service.js";
const router = Router();
const occurrenceFilterSchema = z.enum([
    "today",
    "upcoming",
    "active",
    "failed",
    "pending_assignment",
    "completed",
    "cancelled",
]);
const assignmentSchema = z
    .object({
    driverId: z.string().min(1),
    startDate: z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)),
    endDate: z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)),
})
    .refine((value) => value.endDate >= value.startDate, {
    message: "Assignment end date must be on or after its start date.",
    path: ["endDate"],
});
const updateOwnerProfileSchema = z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(20),
});
router.get("/subscriptions/overview", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (_req, res) => {
    const window = getSchedulerWindow();
    const [activeSubscriptions, pausedSubscriptions, deliveriesGeneratedToday, upcomingDeliveries, schedulingFailures, subscriptionsNeedingAttention, activeDriverAssignments, unassignedDeliveries, completedDeliveries, cancelledDeliveries, stockExceptions] = await Promise.all([
        prisma.subscription.count({
            where: { status: SubscriptionStatus.ACTIVE },
        }),
        prisma.subscription.count({
            where: { status: SubscriptionStatus.PAUSED },
        }),
        prisma.subscriptionOccurrence.count({
            where: {
                status: SubscriptionOccurrenceStatus.GENERATED,
                scheduledAt: {
                    gte: window.todayStart,
                    lt: window.tomorrowStart,
                },
            },
        }),
        prisma.subscriptionOccurrence.count({
            where: {
                status: SubscriptionOccurrenceStatus.GENERATED,
                scheduledAt: { gte: window.now, lte: window.end },
            },
        }),
        prisma.subscriptionOccurrence.count({
            where: { status: SubscriptionOccurrenceStatus.FAILED },
        }),
        prisma.subscription.count({
            where: {
                status: SubscriptionStatus.ACTIVE,
                occurrences: {
                    some: { status: SubscriptionOccurrenceStatus.FAILED },
                },
            },
        }),
        prisma.subscriptionDriverAssignment.count({
            where: {
                startDate: {
                    lte: new Date(`${window.horizonDate}T00:00:00.000Z`),
                },
                endDate: { gte: window.todayDate },
            },
        }),
        prisma.delivery.count({
            where: {
                driverId: null,
                status: DeliveryStatus.PENDING,
                order: {
                    is: {
                        subscriptionOccurrence: {
                            is: { scheduledAt: { gte: window.now, lte: window.end } },
                        },
                    },
                },
            },
        }),
        prisma.delivery.count({
            where: {
                status: DeliveryStatus.COMPLETED,
                completedAt: { not: null },
                order: {
                    is: {
                        subscriptionOccurrence: {
                            is: { scheduledAt: { gte: window.todayStart, lte: window.end } },
                        },
                    },
                },
            },
        }),
        prisma.delivery.count({
            where: {
                status: DeliveryStatus.CANCELLED,
                order: {
                    is: {
                        subscriptionOccurrence: {
                            is: { scheduledAt: { gte: window.todayStart, lte: window.end } },
                        },
                    },
                },
            },
        }),
        prisma.subscriptionOccurrence.count({
            where: {
                status: SubscriptionOccurrenceStatus.FAILED,
                failureReason: { contains: "inventory", mode: "insensitive" },
            },
        }),
    ]);
    res.json({
        success: true,
        data: {
            activeSubscriptions,
            pausedSubscriptions,
            deliveriesGeneratedToday,
            upcomingDeliveries,
            schedulingFailures,
            subscriptionsNeedingAttention,
            activeDriverAssignments,
            unassignedDeliveries,
            completedDeliveries,
            cancelledDeliveries,
            stockExceptions,
        },
    });
}));
router.get("/subscriptions/occurrences", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (req, res) => {
    const parsed = occurrenceFilterSchema.safeParse(req.query.filter ?? "upcoming");
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid scheduled delivery filter.",
            errors: parsed.error.flatten(),
        });
    }
    const window = getSchedulerWindow();
    const baseWhere = {
        ...(parsed.data === "today"
            ? {
                scheduledAt: {
                    gte: window.todayStart,
                    lt: window.tomorrowStart,
                },
                status: SubscriptionOccurrenceStatus.GENERATED,
            }
            : parsed.data === "failed"
                ? { status: SubscriptionOccurrenceStatus.FAILED }
                : parsed.data === "pending_assignment"
                    ? {
                        status: SubscriptionOccurrenceStatus.GENERATED,
                        scheduledAt: { gte: window.now, lte: window.end },
                        order: {
                            is: {
                                delivery: {
                                    is: {
                                        status: DeliveryStatus.PENDING,
                                        driverId: null,
                                    },
                                },
                            },
                        },
                    }
                    : parsed.data === "completed"
                        ? {
                            status: SubscriptionOccurrenceStatus.GENERATED,
                            order: { is: { status: "COMPLETED" } },
                        }
                        : parsed.data === "cancelled"
                            ? {
                                OR: [
                                    { status: SubscriptionOccurrenceStatus.CANCELLED },
                                    { order: { is: { status: "CANCELLED" } } },
                                ],
                            }
                            : {
                                scheduledAt: { gte: window.now, lte: window.end },
                                ...(parsed.data === "active"
                                    ? {
                                        subscription: {
                                            is: { status: SubscriptionStatus.ACTIVE },
                                        },
                                    }
                                    : {
                                        status: {
                                            in: [
                                                SubscriptionOccurrenceStatus.GENERATED,
                                                SubscriptionOccurrenceStatus.PENDING,
                                                SubscriptionOccurrenceStatus.FAILED,
                                            ],
                                        },
                                    }),
                            }),
    };
    const occurrences = await prisma.subscriptionOccurrence.findMany({
        where: baseWhere,
        include: {
            subscription: {
                include: {
                    customer: { include: { user: { select: { name: true } } } },
                    product: { select: { name: true, bottleSizeLiters: true } },
                    address: {
                        select: {
                            label: true,
                            addressLine1: true,
                            addressLine2: true,
                            city: true,
                            state: true,
                            postalCode: true,
                        },
                    },
                },
            },
            order: {
                include: {
                    delivery: {
                        include: {
                            driver: {
                                include: {
                                    user: { select: { name: true, phone: true } },
                                },
                            },
                        },
                    },
                },
            },
        },
        orderBy: { scheduledAt: "asc" },
        take: 200,
    });
    res.json({ success: true, data: occurrences });
}));
router.get("/customers", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search.length > 100) {
        return res.status(400).json({
            success: false,
            message: "Search text must be 100 characters or fewer.",
        });
    }
    const customers = await prisma.customerProfile.findMany({
        where: search
            ? {
                user: {
                    OR: [
                        { name: { contains: search, mode: "insensitive" } },
                        { phone: { contains: search, mode: "insensitive" } },
                    ],
                },
            }
            : undefined,
        include: {
            user: { select: { name: true, phone: true, email: true } },
            addresses: {
                select: {
                    id: true,
                    label: true,
                    addressLine1: true,
                    addressLine2: true,
                    city: true,
                    state: true,
                    postalCode: true,
                    isDefault: true,
                },
                orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
            },
            subscriptions: {
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
                    driverAssignments: {
                        include: {
                            driver: {
                                include: {
                                    user: { select: { name: true, phone: true, isActive: true } },
                                },
                            },
                        },
                        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
                    },
                    occurrences: {
                        include: {
                            order: {
                                include: {
                                    delivery: {
                                        include: {
                                            driver: {
                                                include: {
                                                    user: { select: { name: true, phone: true } },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        orderBy: { scheduledAt: "desc" },
                        take: 30,
                    },
                },
                orderBy: { createdAt: "desc" },
            },
        },
        orderBy: { user: { name: "asc" } },
        take: 200,
    });
    return res.json({
        success: true,
        data: customers,
    });
}));
router.get("/subscriptions/assignments", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (req, res) => {
    const subscriptionId = typeof req.query.subscriptionId === "string"
        ? req.query.subscriptionId
        : undefined;
    const assignments = await prisma.subscriptionDriverAssignment.findMany({
        where: subscriptionId ? { subscriptionId } : undefined,
        include: {
            driver: { include: { user: { select: { name: true, phone: true, isActive: true } } } },
            subscription: {
                include: {
                    customer: { include: { user: { select: { name: true, phone: true } } } },
                    product: { select: { name: true } },
                },
            },
        },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 500,
    });
    return res.json({ success: true, data: assignments });
}));
router.post("/subscriptions/:subscriptionId/assignments", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (req, res) => {
    const parsed = assignmentSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid driver assignment details.",
            errors: parsed.error.flatten(),
        });
    }
    const subscriptionId = Array.isArray(req.params.subscriptionId)
        ? req.params.subscriptionId[0]
        : req.params.subscriptionId;
    if (!subscriptionId) {
        return res.status(400).json({
            success: false,
            message: "A subscription reference is required.",
        });
    }
    const assignment = await createSubscriptionDriverAssignment({
        subscriptionId,
        driverId: parsed.data.driverId,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
    });
    return res.status(201).json({ success: true, data: assignment });
}));
router.post("/subscriptions/scheduler/run", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (_req, res) => {
    const summary = await runSubscriptionScheduler();
    res.json({
        success: true,
        message: "Subscription scheduler run completed.",
        data: summary,
    });
}));
router.get("/profile", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            name: true,
            email: true,
            phone: true,
            isActive: true,
        },
    });
    if (!user) {
        res.status(404).json({
            success: false,
            message: "Owner account not found.",
        });
        return;
    }
    res.json({
        success: true,
        data: {
            name: user.name,
            email: user.email,
            phone: user.phone ?? "",
            accountStatus: user.isActive ? "ACTIVE" : "INACTIVE",
        },
    });
}));
router.patch("/profile", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (req, res) => {
    const parsed = updateOwnerProfileSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: "Invalid owner profile details.",
            errors: parsed.error.flatten(),
        });
        return;
    }
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true },
    });
    if (!user) {
        res.status(404).json({
            success: false,
            message: "Owner account not found.",
        });
        return;
    }
    const updated = await prisma.user.update({
        where: { id: user.id },
        data: parsed.data,
        select: {
            name: true,
            email: true,
            phone: true,
            isActive: true,
        },
    });
    res.json({
        success: true,
        message: "Owner profile updated successfully.",
        data: {
            name: updated.name,
            email: updated.email,
            phone: updated.phone ?? "",
            accountStatus: updated.isActive ? "ACTIVE" : "INACTIVE",
        },
    });
}));
export default router;
