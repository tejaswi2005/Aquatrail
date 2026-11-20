
import "dotenv/config";
import http from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { z } from "zod";
import { DeliveryStatus } from "@prisma/client";

import { createApp } from "./app.js";
import { prisma } from "./config/prisma.js";
import {
  getLiveLocation,
  setLiveLocation,
  clearLiveLocation,
  setLocationClearBroadcaster,
  canPublishDeliveryLocation,
} from "./services/liveLocation.service.js";
import { startSubscriptionScheduler } from "./services/subscriptionScheduler.service.js";

const PORT = Number(process.env.PORT) || 5000;
const app = createApp();
const httpServer = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured.");
}

const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

setLocationClearBroadcaster((deliveryId) => {
  io.to(`delivery:${deliveryId}`).emit(
    "delivery:location:cleared",
    deliveryId
  );
});

interface SocketUser {
  id: string;
  role: "OWNER" | "DRIVER" | "CUSTOMER";
}

declare module "socket.io" {
  interface SocketData {
    user: SocketUser;
  }
}

const subscribeSchema = z.object({
  deliveryId: z.string().min(1),
});

const locationSchema = z.object({
  deliveryId: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).optional(),
});

// Authenticate every Socket.IO connection.
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (typeof token !== "string") {
      return next(new Error("Authentication required."));
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded === "string") {
      return next(new Error("Invalid authentication token."));
    }

    const claims = decoded as jwt.JwtPayload & {
      id?: string;
      sub?: string;
      role?: string;
    };

    const userId = claims.id ?? claims.sub;

    if (
      !userId ||
      !["OWNER", "DRIVER", "CUSTOMER"].includes(
        claims.role ?? ""
      )
    ) {
      return next(new Error("Invalid authentication token."));
    }

    socket.data.user = {
      id: userId,
      role: claims.role as SocketUser["role"],
    };

    next();
  } catch {
    next(new Error("Invalid or expired authentication token."));
  }
});

io.on("connection", (socket) => {
  console.log(`Authenticated socket connected: ${socket.id}`);

  // Customer or assigned driver subscribes to a delivery.
  socket.on("delivery:subscribe", async (payload, acknowledge) => {
    const parsed = subscribeSchema.safeParse(payload);

    if (!parsed.success) {
      acknowledge?.({
        success: false,
        message: "Invalid delivery ID.",
      });
      return;
    }

    try {
      const delivery = await prisma.delivery.findUnique({
        where: { id: parsed.data.deliveryId },
        include: {
          order: {
            include: {
              customer: true,
            },
          },
          driver: true,
        },
      });

      if (!delivery) {
        acknowledge?.({
          success: false,
          message: "Delivery not found.",
        });
        return;
      }

      const user = socket.data.user;

      const isCustomer =
        user.role === "CUSTOMER" &&
        delivery.order.customer.userId === user.id;

      const isAssignedDriver =
        user.role === "DRIVER" &&
        delivery.driver?.userId === user.id;

      if (!isCustomer && !isAssignedDriver) {
        acknowledge?.({
          success: false,
          message: "You cannot access this delivery.",
        });
        return;
      }

      if (delivery.status !== DeliveryStatus.STARTED) {
        acknowledge?.({
          success: false,
          message: "Live location is only available during an active delivery.",
        });
        return;
      }

      // Subscribe only after authorization succeeds.
      await socket.join(`delivery:${delivery.id}`);

      // Send the latest in-memory location, if available.
      const latestLocation = getLiveLocation(delivery.id);

      if (latestLocation) {
        socket.emit("delivery:location", latestLocation);
      }

      acknowledge?.({
        success: true,
        deliveryId: delivery.id,
      });
    } catch (error) {
      console.error("Delivery subscription failed:", error);

      acknowledge?.({
        success: false,
        message: "Unable to subscribe to delivery.",
      });
    }
  });


  // Leave a delivery room when the customer exits tracking.
socket.on("delivery:unsubscribe", (payload) => {
  const parsed = subscribeSchema.safeParse(payload);

  if (!parsed.success) {
    return;
  }

  socket.leave(`delivery:${parsed.data.deliveryId}`);
});

  socket.on("delivery:location:stop", async (payload, acknowledge) => {
    const parsed = subscribeSchema.safeParse(payload);

    if (!parsed.success) {
      acknowledge?.({
        success: false,
        message: "Invalid delivery ID.",
      });
      return;
    }

    try {
      const user = socket.data.user;

      if (user.role !== "DRIVER") {
        acknowledge?.({
          success: false,
          message: "Only drivers can stop location sharing.",
        });
        return;
      }

      const delivery = await prisma.delivery.findUnique({
        where: { id: parsed.data.deliveryId },
        include: { driver: true },
      });

      if (!delivery || delivery.driver?.userId !== user.id) {
        acknowledge?.({
          success: false,
          message: "This delivery is not assigned to you.",
        });
        return;
      }

      clearLiveLocation(delivery.id);
      acknowledge?.({ success: true });
    } catch (error) {
      console.error("Stopping driver location sharing failed:", error);

      acknowledge?.({
        success: false,
        message: "Unable to stop location sharing.",
      });
    }
  });

  // Only the assigned driver can publish GPS coordinates.
  socket.on(
    "delivery:location:update",
    async (payload, acknowledge) => {
      const parsed = locationSchema.safeParse(payload);

      if (!parsed.success) {
        acknowledge?.({
          success: false,
          message: "Invalid location coordinates.",
        });
        return;
      }

      try {
        const user = socket.data.user;

        if (user.role !== "DRIVER") {
          acknowledge?.({
            success: false,
            message: "Only drivers can update delivery locations.",
          });
          return;
        }

        const delivery = await prisma.delivery.findUnique({
          where: { id: parsed.data.deliveryId },
          include: { driver: true },
        });

        if (!delivery || delivery.driver?.userId !== user.id) {
          acknowledge?.({
            success: false,
            message: "This delivery is not assigned to you.",
          });
          return;
        }

        if (
          !canPublishDeliveryLocation({
            role: user.role,
            userId: user.id,
            assignedDriverUserId: delivery.driver?.userId ?? null,
            deliveryStatus: delivery.status,
          })
        ) {
          acknowledge?.({
            success: false,
            message: "Location can only be shared during an active delivery.",
          });
          return;
        }

        // Keep only the latest location in server memory.
        const update = {
          deliveryId: delivery.id,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
          ...(parsed.data.accuracy !== undefined && {
            accuracy: parsed.data.accuracy,
          }),
          timestamp: new Date().toISOString(),
        };

        setLiveLocation(update);

        // Notify only authorized subscribers in this delivery room.
        io.to(`delivery:${delivery.id}`).emit(
          "delivery:location",
          update
        );

        acknowledge?.({ success: true });
      } catch (error) {
        console.error("Driver location update failed:", error);

        acknowledge?.({
          success: false,
          message: "Unable to process the location update.",
        });
      }
    }
  );

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`AquaTrail server running on port ${PORT}`);
  try {
    startSubscriptionScheduler();
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: "subscription_scheduler_start_failed",
        errorType: error instanceof Error ? error.name : "unknown",
      })
    );
  }
});
