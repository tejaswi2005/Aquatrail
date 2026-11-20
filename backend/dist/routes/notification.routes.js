import { Router } from "express";
import { NotificationStatus, UserRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { authenticate, allowRoles, } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { retryFailedNotification } from "../services/smsNotification.service.js";
const router = Router();
router.get("/failed", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (_req, res) => {
    const notifications = await prisma.notification.findMany({
        where: { status: NotificationStatus.FAILED },
        select: {
            id: true,
            type: true,
            orderId: true,
            subscriptionId: true,
            attemptCount: true,
            attemptedAt: true,
            createdAt: true,
        },
        orderBy: { attemptedAt: "asc" },
        take: 100,
    });
    res.json({ success: true, data: notifications });
}));
router.post("/:notificationId/retry", authenticate, allowRoles(UserRole.OWNER), asyncHandler(async (req, res) => {
    const notificationId = req.params.notificationId;
    if (typeof notificationId !== "string" || !notificationId.trim()) {
        res.status(400).json({
            success: false,
            message: "A valid notification ID is required.",
        });
        return;
    }
    const notification = await retryFailedNotification(notificationId);
    if (!notification) {
        res.status(404).json({
            success: false,
            message: "Notification not found.",
        });
        return;
    }
    res.json({
        success: true,
        message: notification.status === NotificationStatus.SENT
            ? "SMS request accepted by the provider."
            : notification.status === NotificationStatus.FAILED
                ? "SMS retry failed. Review provider configuration and try again."
                : "Notification is already being processed or has already been sent.",
        data: {
            id: notification.id,
            type: notification.type,
            status: notification.status,
            attemptCount: notification.attemptCount,
            sentAt: notification.sentAt,
            providerReference: notification.providerReference,
        },
    });
}));
export default router;
