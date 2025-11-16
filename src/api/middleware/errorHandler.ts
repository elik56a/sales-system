import { Request, Response, NextFunction } from "express";
import { createContextLogger } from "@/monitoring/logger";

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const logger = createContextLogger(req.correlationId);

  let statusCode = 500;
  let message = "Internal Server Error";
  let isOperational = false;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    isOperational = error.isOperational;
  }

  // Log error details
  logger.error("Request error", {
    error: error.message,
    stack: error.stack,
    statusCode,
    path: req.path,
    method: req.method,
    isOperational,
  });

  // Don't leak error details in production
  const response: any = {
    error: statusCode < 500 ? message : "Internal Server Error",
    correlationId: req.correlationId,
  };

  if (process.env.NODE_ENV === "development") {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response) => {
  const logger = createContextLogger(req.correlationId);

  logger.warn("Route not found", {
    path: req.path,
    method: req.method,
  });

  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`,
    correlationId: req.correlationId,
  });
};
