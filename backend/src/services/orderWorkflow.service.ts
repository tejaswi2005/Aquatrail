import {
  DeliveryStatus,
  InventoryTransactionType,
  OrderStatus,
  Prisma,
  SubscriptionOccurrenceStatus,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "../config/prisma.js";

export class WorkflowError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

export class OrderCreationError extends Error {
  constructor(
    readonly code: "INVALID_PRODUCTS" | "INSUFFICIENT_STOCK" | "INVALID_PRICE"
  ) {
    super(code);
    this.name = "OrderCreationError";
  }
}

export interface CreateOrderInput {
  customerId: string;
  addressId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPricePaise?: number;
  }>;
  notes?: string;
  subscriptionOccurrenceId?: string;
  assignedDriverId?: string | null;
}

async function releaseReservedInventory(
  tx: Prisma.TransactionClient,
  orderId: string,
  note: string
): Promise<void> {
  const reservations = await tx.inventoryTransaction.findMany({
    where: {
      orderId,
      type: InventoryTransactionType.ORDER_RESERVED,
    },
    select: { productId: true, quantity: true },
  });

  for (const reservation of reservations) {
    if (reservation.quantity >= 0) {
      throw new Error(`Invalid inventory reservation for order ${orderId}.`);
    }

    const release = await tx.inventoryTransaction.createMany({
      data: {
        orderId,
        productId: reservation.productId,
        type: InventoryTransactionType.ORDER_RELEASED,
        quantity: -reservation.quantity,
        note,
      },
      skipDuplicates: true,
    });

    if (release.count === 1) {
      await tx.product.update({
        where: { id: reservation.productId },
        data: { stockQuantity: { increment: -reservation.quantity } },
      });
    }
  }
}

export async function createOrderWithInventoryReservation(
  tx: Prisma.TransactionClient,
  input: CreateOrderInput
) {
  const products = await tx.product.findMany({
    where: {
      id: { in: input.items.map((item) => item.productId) },
      isActive: true,
    },
  });

  if (products.length !== input.items.length) {
    throw new OrderCreationError("INVALID_PRODUCTS");
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  let totalAmountPaise = 0;
  const orderItems = input.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new OrderCreationError("INVALID_PRODUCTS");

    const unitPricePaise = item.unitPricePaise ?? product.pricePaise;
    const subtotalPaise = unitPricePaise * item.quantity;
    if (
      !Number.isSafeInteger(unitPricePaise) ||
      unitPricePaise < 0 ||
      !Number.isSafeInteger(subtotalPaise)
    ) {
      throw new OrderCreationError("INVALID_PRICE");
    }

    totalAmountPaise += subtotalPaise;
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPricePaise,
      subtotalPaise,
    };
  });

  if (!Number.isSafeInteger(totalAmountPaise)) {
    throw new OrderCreationError("INVALID_PRICE");
  }

  for (const item of input.items) {
    const updated = await tx.product.updateMany({
      where: {
        id: item.productId,
        isActive: true,
        stockQuantity: { gte: item.quantity },
      },
      data: { stockQuantity: { decrement: item.quantity } },
    });

    if (updated.count !== 1) {
      throw new OrderCreationError("INSUFFICIENT_STOCK");
    }
  }

  const orderNumber = `AT-${Date.now()}-${randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
  const order = await tx.order.create({
    data: {
      orderNumber,
      customerId: input.customerId,
      addressId: input.addressId,
      notes: input.notes,
      subscriptionOccurrenceId: input.subscriptionOccurrenceId,
      status: OrderStatus.PENDING,
      totalAmountPaise,
      items: { create: orderItems },
      delivery: {
        create: {
          status: DeliveryStatus.PENDING,
          driverId: input.assignedDriverId ?? null,
        },
      },
    },
    include: {
      items: { include: { product: true } },
      delivery: true,
    },
  });

  await tx.inventoryTransaction.createMany({
    data: input.items.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      type: InventoryTransactionType.ORDER_RESERVED,
      quantity: -item.quantity,
      note: input.subscriptionOccurrenceId
        ? "Subscription delivery reservation"
        : "Customer order",
    })),
  });

  return order;
}

export async function listDriverDeliveries(
  userId: string,
  activeOnly: boolean
) {
  const driver = await prisma.driverProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!driver) return null;

  return prisma.delivery.findMany({
    where: {
      driverId: driver.id,
      ...(activeOnly
        ? {
            status: {
              in: [DeliveryStatus.PENDING, DeliveryStatus.STARTED],
            },
          }
        : {}),
    },
    include: {
      order: {
        include: {
          customer: {
            include: {
              user: {
                select: { id: true, name: true, phone: true },
              },
            },
          },
          address: true,
          items: { include: { product: true } },
          subscriptionOccurrence: {
            select: { scheduledAt: true },
          },
        },
      },
    },
    orderBy: activeOnly ? { createdAt: "desc" } : { updatedAt: "desc" },
  });
}

export async function updateDeliveryStatusForDriver(
  deliveryId: string,
  userId: string,
  nextStatus: DeliveryStatus,
  cancellationReason?: string
) {
  return prisma.$transaction(async (tx) => {
    const driver = await tx.driverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!driver) throw new WorkflowError(404, "Driver profile not found.");

    await tx.$queryRaw`
      SELECT "id" FROM "Delivery" WHERE "id" = ${deliveryId} FOR UPDATE
    `;

    const delivery = await tx.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: true },
    });
    if (!delivery) throw new WorkflowError(404, "Delivery not found.");
    if (delivery.driverId !== driver.id) {
      throw new WorkflowError(403, "This delivery is not assigned to you.");
    }
    if (
      nextStatus === DeliveryStatus.CANCELLED &&
      !cancellationReason?.trim()
    ) {
      throw new WorkflowError(400, "A cancellation reason is required.");
    }
    if (delivery.status === nextStatus) return delivery;

    const allowed =
      (delivery.status === DeliveryStatus.PENDING &&
        (nextStatus === DeliveryStatus.STARTED ||
          nextStatus === DeliveryStatus.CANCELLED)) ||
      (delivery.status === DeliveryStatus.STARTED &&
        (nextStatus === DeliveryStatus.COMPLETED ||
          nextStatus === DeliveryStatus.CANCELLED));
    if (!allowed) {
      throw new WorkflowError(
        409,
        `Cannot change delivery status from ${delivery.status} to ${nextStatus}.`
      );
    }

    const now = new Date();
    const updated = await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        status: nextStatus,
        ...(nextStatus === DeliveryStatus.STARTED
          ? { startedAt: delivery.startedAt ?? now }
          : {}),
        ...(nextStatus === DeliveryStatus.COMPLETED
          ? { completedAt: delivery.completedAt ?? now }
          : {}),
        ...(nextStatus === DeliveryStatus.CANCELLED
          ? { cancelledAt: delivery.cancelledAt ?? now, cancellationReason }
          : {}),
      },
    });

    await tx.order.update({
      where: { id: delivery.orderId },
      data: {
        status:
          nextStatus === DeliveryStatus.STARTED
            ? OrderStatus.STARTED
            : nextStatus === DeliveryStatus.COMPLETED
              ? OrderStatus.COMPLETED
              : OrderStatus.CANCELLED,
      },
    });

    if (nextStatus === DeliveryStatus.CANCELLED) {
      await releaseReservedInventory(
        tx,
        delivery.orderId,
        "Released after delivery cancellation"
      );
    }

    return updated;
  });
}

export async function cancelUnassignedFutureSubscriptionOccurrences(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  now: Date
): Promise<void> {
  const occurrences = await tx.subscriptionOccurrence.findMany({
    where: {
      subscriptionId,
      scheduledAt: { gt: now },
      status: {
        in: [
          SubscriptionOccurrenceStatus.PENDING,
          SubscriptionOccurrenceStatus.FAILED,
          SubscriptionOccurrenceStatus.GENERATED,
        ],
      },
    },
    include: {
      order: { include: { delivery: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  for (const occurrence of occurrences) {
    const order = occurrence.order;
    if (order) {
      const delivery = order.delivery;
      const started =
        order.status === OrderStatus.STARTED ||
        order.status === OrderStatus.COMPLETED ||
        delivery?.status === DeliveryStatus.STARTED ||
        delivery?.status === DeliveryStatus.COMPLETED;
      if (started || delivery?.driverId) continue;

      if (delivery && delivery.status !== DeliveryStatus.CANCELLED) {
        await tx.delivery.update({
          where: { id: delivery.id },
          data: {
            status: DeliveryStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: "Subscription ended before delivery started.",
          },
        });
      }
      if (order.status !== OrderStatus.CANCELLED) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CANCELLED },
        });
        await releaseReservedInventory(
          tx,
          order.id,
          "Released after subscription cancellation"
        );
      }
    }

    await tx.subscriptionOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: SubscriptionOccurrenceStatus.CANCELLED,
        failureReason: null,
      },
    });
  }
}
