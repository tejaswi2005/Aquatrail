
import { Router } from "express";
import {
  DeliveryStatus,
  NotificationType,
  Prisma,
  UserRole,
} from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { prisma } from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  authenticate,
  allowRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import {
  listDriverDeliveries,
  updateDeliveryStatusForDriver,
} from "../services/orderWorkflow.service.js";
import { clearLiveLocation } from "../services/liveLocation.service.js";
import { sendDeliveryNotification } from "../services/smsNotification.service.js";

const router = Router();

const cancellationReasonSchema = z.enum([
  "CUSTOMER_UNAVAILABLE",
  "CUSTOMER_REQUESTED",
  "ADDRESS_INCORRECT",
  "PHONE_UNREACHABLE",
  "OTHER",
]);

const statusSchema = z.object({
  status: z.enum(["STARTED", "COMPLETED", "CANCELLED"]),
  cancellationReason: cancellationReasonSchema.optional(),
  otherCancellationReason: z.string().trim().min(3).max(200).optional(),
}).superRefine((data, ctx) => {
  if (data.status === DeliveryStatus.CANCELLED && !data.cancellationReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cancellationReason"],
      message: "Choose a cancellation reason.",
    });
  }
  if (
    data.status === DeliveryStatus.CANCELLED &&
    data.cancellationReason === "OTHER" &&
    !data.otherCancellationReason
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["otherCancellationReason"],
      message: "Explain the other cancellation reason.",
    });
  }
  if (
    data.status === DeliveryStatus.CANCELLED &&
    data.cancellationReason !== "OTHER" &&
    data.otherCancellationReason
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["otherCancellationReason"],
      message: "Only provide an explanation when reason is Other.",
    });
  }
});

/**
 * GET /api/drivers/my
 * Return the logged-in driver's delivery history.
 */
router.get(
  "/my",
  authenticate,
  allowRoles(UserRole.DRIVER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const deliveries = await listDriverDeliveries(
      req.user!.id,
      false
    );

    if (!deliveries) {
      res.status(404).json({
        success: false,
        message: "Driver profile not found.",
      });
      return;
    }

    res.json({
      success: true,
      data: deliveries.map((delivery) => ({
        id: delivery.id,
        status: delivery.status,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
        startedAt: delivery.startedAt,
        completedAt: delivery.completedAt,
        cancelledAt: delivery.cancelledAt,
        cancellationReason: delivery.cancellationReason,
        order: {
          id: delivery.order.id,
          orderNumber: delivery.order.orderNumber,
          status: delivery.order.status,
          totalAmountPaise: delivery.order.totalAmountPaise,
          notes: delivery.order.notes,
          scheduledAt:
            delivery.order.subscriptionOccurrence?.scheduledAt ?? null,
          customer: {
            name: delivery.order.customer.user.name,
            phone: delivery.order.customer.user.phone,
          },
          address: delivery.order.address,
          items: delivery.order.items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            product: {
              id: item.product.id,
              name: item.product.name,
              bottleSizeLiters: item.product.bottleSizeLiters,
            },
          })),
        },
      })),
    });
  })
);





router.get(
  "/me",
  authenticate,
  allowRoles(UserRole.DRIVER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const driver = await prisma.driverProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    if (!driver) {
      res.status(404).json({
        success: false,
        message: "Driver profile not found.",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: driver.id,
        userId: driver.userId,
        name: driver.user.name,
        email: driver.user.email,
        phone: driver.user.phone,
        role: driver.user.role,
        isActive: driver.user.isActive,
        licenseNumber: driver.licenseNumber,
        createdAt: driver.user.createdAt,
      },
    });
  })
);


/**
 * PATCH /api/deliveries/:id/status
 * Update the status of a delivery assigned to the logged-in driver.
 */
router.patch(
  "/:id/status",
  authenticate,
  allowRoles(UserRole.DRIVER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = statusSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid delivery status or failure details.",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { status: nextStatus, cancellationReason, otherCancellationReason } =
      parsed.data;

    const cancellationLabels = {
      CUSTOMER_UNAVAILABLE: "Customer not available",
      CUSTOMER_REQUESTED: "Customer requested cancellation",
      ADDRESS_INCORRECT: "Address incorrect or not found",
      PHONE_UNREACHABLE: "Customer phone unreachable",
      OTHER: `Other: ${otherCancellationReason ?? ""}`,
    } as const;
    const reason =
      nextStatus === DeliveryStatus.CANCELLED && cancellationReason
        ? cancellationLabels[cancellationReason]
        : undefined;

    // Safely narrow the route parameter to a string.
    const rawDeliveryId = req.params.id;
    const deliveryId = Array.isArray(rawDeliveryId)
      ? rawDeliveryId[0]
      : rawDeliveryId;

    if (
      typeof deliveryId !== "string" ||
      deliveryId.trim().length === 0
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid delivery ID.",
      });
      return;
    }

    const result = await updateDeliveryStatusForDriver(
      deliveryId,
      req.user!.id,
      nextStatus,
      reason
    );

    if (
      result.status === DeliveryStatus.COMPLETED ||
      result.status === DeliveryStatus.CANCELLED
    ) {
      clearLiveLocation(result.id);
    }

    const notificationType =
      result.status === DeliveryStatus.STARTED
        ? NotificationType.DELIVERY_STARTED
        : result.status === DeliveryStatus.COMPLETED
          ? NotificationType.DELIVERY_COMPLETED
          : result.status === DeliveryStatus.CANCELLED
            ? NotificationType.DELIVERY_CANCELLED
            : null;
    if (notificationType) {
      void sendDeliveryNotification(result.id, notificationType).catch(
        (error: unknown) => {
          console.error(
            JSON.stringify({
              event: "delivery_notification_failed",
              deliveryId: result.id,
              notificationType,
              errorType: error instanceof Error ? error.name : "unknown",
            })
          );
        }
      );
    }

    res.json({
      success: true,
      message: `Delivery updated to ${result.status}.`,
      data: {
        id: result.id,
        status: result.status,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        cancelledAt: result.cancelledAt,
        cancellationReason: result.cancellationReason,
      },
    });
  })
);



const createDriverSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  phone: z.string().trim().min(7).max(20).optional(),
  licenseNumber: z.string().trim().max(120).optional(),
  temporaryPassword: z
    .string()
    .min(8)
    .max(100)
    .refine(
      (password) => Buffer.byteLength(password, "utf8") <= 72,
      "Temporary password must be no more than 72 bytes."
    ),
});

/**
 * GET /api/drivers
 * List drivers for the owner dashboard.
 */
router.post(
  "/",
  authenticate,
  allowRoles(UserRole.OWNER),
  asyncHandler(async (req, res) => {
    const parsed = createDriverSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid driver details.",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { name, email, phone, licenseNumber, temporaryPassword } =
      parsed.data;
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    try {
      const user = await prisma.$transaction(async (tx) => {
        return tx.user.create({
          data: {
            name,
            email,
            phone: phone || null,
            passwordHash,
            role: UserRole.DRIVER,
            driverProfile: {
              create: {
                licenseNumber: licenseNumber || null,
              },
            },
          },
          include: {
            driverProfile: true,
          },
        });
      });

      if (!user.driverProfile) {
        throw new Error("Driver profile was not created.");
      }

      res.status(201).json({
        success: true,
        message:
          "Driver account created successfully. Share the temporary password securely.",
        data: {
          driver: {
            id: user.driverProfile.id,
            userId: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            isActive: user.isActive,
            licenseNumber: user.driverProfile.licenseNumber,
            createdAt: user.createdAt,
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        res.status(409).json({
          success: false,
          message: "An account with this email already exists.",
        });
        return;
      }

      throw error;
    }
  })
);

router.get(
  "/",
  authenticate,
  allowRoles(UserRole.OWNER),
  asyncHandler(async (_req, res) => {
    const drivers = await prisma.driverProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      success: true,
      data: drivers.map((driver) => ({
        id: driver.id,
        userId: driver.userId,
        name: driver.user.name,
        email: driver.user.email,
        phone: driver.user.phone,
        isActive: driver.user.isActive,
        licenseNumber: driver.licenseNumber,
        createdAt: driver.user.createdAt,
      })),
    });
  })
);

export default router;
