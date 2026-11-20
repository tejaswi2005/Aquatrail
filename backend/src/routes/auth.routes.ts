import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

import { prisma } from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  authenticate,
  allowRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(100),
  phone: z.string().trim().min(7).max(20),
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(100),
    newPassword: z
      .string()
      .min(10)
      .max(72)
      .refine(
        (password) => Buffer.byteLength(password, "utf8") <= 72,
        "New password must be no more than 72 bytes."
      ),
  })
  .refine(
    ({ currentPassword, newPassword }) => currentPassword !== newPassword,
    {
      message: "New password must be different from the current password.",
      path: ["newPassword"],
    }
  );

/**
 * POST /api/auth/register
 * Public registration creates customer accounts only.
 */
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid registration details.",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { name, email, password, phone } = parsed.data;

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

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        phone: phone || null,
        role: UserRole.CUSTOMER,
        customerProfile: {
          create: {},
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "Registration successful.",
      data: { user },
    });
  })
);

/**
 * POST /api/auth/login
 * Verify credentials and issue a JWT.
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Please provide a valid email and password.",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
      return;
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
      return;
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      res.status(500).json({
        success: false,
        message: "Authentication is not configured.",
      });
      return;
    }

    const accessToken = jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      secret,
      { expiresIn: "15m" }
    );

    res.json({
      success: true,
      message: "Login successful.",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        accessToken,
      },
    });
  })
);

/**
 * POST /api/auth/change-password
 * Update the authenticated owner's password after verifying the current one.
 */
router.post(
  "/change-password",
  authenticate,
  allowRoles(UserRole.OWNER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Enter a valid new password.",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: "Your account is not available. Please sign in again.",
      });
      return;
    }

    const currentPasswordMatches = await bcrypt.compare(
      parsed.data.currentPassword,
      user.passwordHash
    );

    if (!currentPasswordMatches) {
      res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.json({
      success: true,
      message: "Password changed successfully.",
    });
  })
);

export default router;