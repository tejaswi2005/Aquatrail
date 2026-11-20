import { Router } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  authenticate,
  allowRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";


const router = Router();

router.get(
  "/:deliveryId",
  authenticate,
  allowRoles(UserRole.CUSTOMER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const deliveryId = req.params.deliveryId;

    if (
      typeof deliveryId !== "string" ||
      deliveryId.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid delivery ID is required.",
      });
    }

    const delivery = await prisma.delivery.findFirst({
      where: {
        id: deliveryId,
        order: {
          customer: {
            userId: req.user!.id,
          },
        },
      },
      include: {
        order: {
          include: {
            address: true,
            customer: {
              select: {
                user: {
                  select: { name: true, phone: true },
                },
              },
            },
          },
        },
        driver: {
          include: {
            user: {
              select: { name: true, phone: true },
            },
          },
        },
      },
    });

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found for this customer.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: delivery.id,
        status: delivery.status,
        startedAt: delivery.startedAt,
        completedAt: delivery.completedAt,
        cancelledAt: delivery.cancelledAt,
        cancellationReason: delivery.cancellationReason,
        orderNumber: delivery.order.orderNumber,
        address: delivery.order.address,
        customer: delivery.order.customer.user,
        driver: delivery.driver
          ? {
              name: delivery.driver.user.name,
              phone: delivery.driver.user.phone,
            }
          : null,
      },
    });
  })
);




export default router;