import { Router } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { allowRoles, authenticate, } from "../middleware/auth.js";
const router = Router();
router.get("/my", authenticate, allowRoles(UserRole.CUSTOMER), asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
        where: { customer: { userId: req.user.id } },
        include: {
            items: { include: { product: true } },
            subscriptionOccurrence: { select: { scheduledAt: true } },
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
        orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: orders });
}));
router.get("/", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (_req, res) => {
    const orders = await prisma.order.findMany({
        include: {
            customer: {
                include: {
                    user: {
                        select: { id: true, name: true, phone: true, email: true },
                    },
                },
            },
            address: true,
            items: { include: { product: true } },
            subscriptionOccurrence: { select: { scheduledAt: true } },
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
        orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: orders });
}));
router.get("/:orderId", authenticate, allowRoles(UserRole.CUSTOMER), asyncHandler(async (req, res) => {
    const orderId = req.params.orderId;
    if (typeof orderId !== "string" || !orderId.trim()) {
        return res.status(400).json({
            success: false,
            message: "A valid order ID is required.",
        });
    }
    const order = await prisma.order.findFirst({
        where: {
            id: orderId,
            customer: { userId: req.user.id },
        },
        include: {
            address: true,
            items: { include: { product: true } },
            subscriptionOccurrence: { select: { scheduledAt: true } },
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
    });
    if (!order) {
        return res.status(404).json({
            success: false,
            message: "Order not found.",
        });
    }
    return res.json({ success: true, data: order });
}));
export default router;
