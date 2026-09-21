import { Router } from "express";
import { login, me, register } from "@/controllers/auth.controller";
import { requireAuth } from "@/middleware/auth";
import { authRateLimiter } from "@/middleware/rateLimit";
import { validate } from "@/middleware/validate";
import { LoginSchema, RegisterSchema } from "@/schemas/requests";
import { asyncHandler } from "@/utils/asyncHandler";

export const authRouter = Router();

authRouter.post("/register", authRateLimiter, validate(RegisterSchema), asyncHandler(register));
authRouter.post("/login", authRateLimiter, validate(LoginSchema), asyncHandler(login));
authRouter.get("/me", requireAuth, asyncHandler(me));
