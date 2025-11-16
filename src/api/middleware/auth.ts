import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "@/config/env";
import { createContextLogger } from "@/monitoring/logger";

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const logger = createContextLogger(req.correlationId);
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    logger.warn("Authentication failed: No token provided");
    return res.status(401).json({
      error: "Unauthorized",
      message: "Access token is required",
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    req.user = {
      id: decoded.sub || decoded.userId || decoded.id,
      role: decoded.role,
    };

    logger.info("Authentication successful", { userId: req.user.id });
    next();
  } catch (error) {
    logger.warn("Authentication failed: Invalid token", {
      error: error instanceof Error ? error.message : error,
    });
    return res.status(403).json({
      error: "Forbidden",
      message: "Invalid or expired token",
    });
  }
};
