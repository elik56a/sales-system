import { Request, Response } from "express";
import { orderService } from "@/services/orderService";
import { createOrderSchema } from "@/api/validation/orderValidation";
import { OrderErrorCode } from "@/types";
import { createContextLogger } from "@/monitoring/logger";
import { ZodError } from "zod";

export const createOrder = async (req: Request, res: Response) => {
  const correlationId = req.correlationId;
  const contextLogger = createContextLogger(correlationId);

  try {
    // Get idempotency key from header
    const idempotencyKey = req.headers["idempotency-key"] as string;

    // Get user info (may be undefined for test endpoints)
    const userId = req.user?.id || "anonymous";

    // Validate request body
    const validatedData = createOrderSchema.parse(req.body);

    contextLogger.info("Creating order", {
      userId,
      customerId: validatedData.customerId,
      itemCount: validatedData.items.length,
      idempotencyKey: idempotencyKey ? "provided" : "none",
    });

    // Call order service
    const result = await orderService.createOrder(
      validatedData,
      idempotencyKey,
      correlationId
    );

    if (result.success) {
      contextLogger.info("Order created successfully", {
        orderId: result.order?.orderId,
      });

      return res.status(201).json({
        success: true,
        data: result.order,
        correlationId,
      });
    }

    // Handle business errors with appropriate HTTP status codes
    const statusCode = getStatusCodeForError(result.error!.code);

    contextLogger.warn("Order creation failed", {
      errorCode: result.error!.code,
      statusCode,
    });

    return res.status(statusCode).json({
      success: false,
      error: result.error,
      correlationId,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      contextLogger.warn("Validation error", {
        errors: error.errors,
      });

      return res.status(400).json({
        success: false,
        error: {
          code: OrderErrorCode.VALIDATION_ERROR,
          message: "Invalid request data",
          details: error.errors,
        },
        correlationId,
      });
    }

    contextLogger.error("Unexpected error in order creation", {
      error: error instanceof Error ? error.message : error,
    });

    return res.status(500).json({
      success: false,
      error: {
        code: OrderErrorCode.INVENTORY_SERVICE_UNAVAILABLE,
        message: "Internal server error",
      },
      correlationId,
    });
  }
};

const getStatusCodeForError = (errorCode: OrderErrorCode): number => {
  switch (errorCode) {
    case OrderErrorCode.INSUFFICIENT_INVENTORY:
    case OrderErrorCode.INVALID_STATUS_TRANSITION:
      return 422; // Unprocessable Entity
    case OrderErrorCode.ORDER_NOT_FOUND:
      return 404; // Not Found
    case OrderErrorCode.DUPLICATE_EVENT:
      return 409; // Conflict
    case OrderErrorCode.VALIDATION_ERROR:
      return 400; // Bad Request
    case OrderErrorCode.INVENTORY_SERVICE_UNAVAILABLE:
    default:
      return 500; // Internal Server Error
  }
};
