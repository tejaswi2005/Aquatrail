import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";
import addressRoutes from "./routes/address.routes.js";
import orderRoutes from "./routes/order.routes.js";
import deliveryRoutes from "./routes/delivery.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import driverRoutes from "./routes/driver.routes.js";
import ownerRoutes from "./routes/owner.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
export function createApp() {
    const app = express();
    // CORS must run before API routes and error handlers.
    app.use(cors({
        origin: (origin, callback) => {
            const allowedOrigins = new Set([
                "http://localhost:5173",
                "http://127.0.0.1:5173",
            ]);
            // Requests without an Origin header are allowed for local tools.
            if (!origin || allowedOrigins.has(origin)) {
                return callback(null, true);
            }
            console.error("Blocked CORS origin:", origin);
            return callback(new Error("Origin not allowed by CORS"));
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }));
    app.use(express.json({ limit: "100kb" }));
    // Health check
    app.get("/api/health", (_req, res) => {
        res.status(200).json({
            success: true,
            message: "AquaTrail backend is running!",
        });
    });
    // Existing API routes
    app.use("/api/auth", authRoutes);
    app.use("/api/products", productRoutes);
    app.use("/api/addresses", addressRoutes);
    app.use("/api/orders", orderRoutes);
    app.use("/api/drivers", driverRoutes);
    app.use("/api/deliveries", deliveryRoutes);
    app.use("/api/customers", customerRoutes);
    app.use("/api/owner", ownerRoutes);
    app.use("/api/subscriptions", subscriptionRoutes);
    // Error handler
    app.use((error, _req, res, _next) => {
        console.error("API error:", error);
        if (res.headersSent) {
            return;
        }
        if (error instanceof Error && "statusCode" in error) {
            const statusCode = error.statusCode;
            if (typeof statusCode === "number") {
                return res.status(statusCode).json({
                    success: false,
                    message: error.message,
                });
            }
        }
        if (error instanceof Error &&
            [
                "INVALID_PRODUCTS",
                "INSUFFICIENT_STOCK",
                "INVALID_PRICE",
            ].includes(error.message)) {
            const status = error.message === "INSUFFICIENT_STOCK" ? 409 : 400;
            return res.status(status).json({
                success: false,
                message: error.message,
            });
        }
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    });
    return app;
}
