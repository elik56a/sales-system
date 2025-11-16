import { db } from "@/database/connection";
import { orders, outboxEvents, processedEvents } from "@/database/schema";
import { inventoryService } from "./inventoryService";
import {
  OrderStatus,
  OrderCreationResult,
  OrderUpdateResult,
  OrderErrorCode,
  UnavailableItem,
  OrderItem,
  CreateOrderResponse,
  ORDER_STATUS,
} from "@/types";
import { EVENT_TYPES } from "@/config/events";
import { logger } from "@/monitoring/logger";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// Define the request type locally (already validated by controller)
interface CreateOrderRequest {
  customerId: string;
  items: OrderItem[];
}

export class OrderService {
  async createOrder(
    request: CreateOrderRequest,
    idempotencyKey?: string,
    correlationId?: string
  ): Promise<OrderCreationResult> {
    const contextLogger = logger.child({
      correlationId,
      customerId: request.customerId,
    });

    try {
      contextLogger.info("Creating order", { itemCount: request.items.length });

      // 1. Check idempotency
      if (idempotencyKey) {
        const existingOrder = await this.findOrderByIdempotencyKey(
          idempotencyKey
        );
        if (existingOrder) {
          contextLogger.info("Returning existing order (idempotent)", {
            orderId: existingOrder.id,
          });
          return {
            success: true,
            order: this.mapOrderToResponse(existingOrder),
          };
        }
      }

      // 2. Check inventory for all items
      const inventoryResult = await this.checkAllItemsAvailability(
        request.items,
        contextLogger
      );
      if (!inventoryResult.success) {
        return inventoryResult;
      }

      // 3. Calculate total amount
      const totalAmount = request.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      // 4. Create order with outbox event (atomic transaction)
      const order = await this.createOrderWithOutbox(
        request,
        totalAmount,
        idempotencyKey,
        contextLogger
      );

      contextLogger.info("Order created successfully", {
        orderId: order.id,
        totalAmount: order.totalAmount,
      });

      return {
        success: true,
        order: this.mapOrderToResponse(order),
      };
    } catch (error) {
      contextLogger.error("Order creation failed", {
        error: error instanceof Error ? error.message : error,
      });

      // System errors (circuit breaker, database, etc.)
      return {
        success: false,
        error: {
          code: OrderErrorCode.INVENTORY_SERVICE_UNAVAILABLE,
          message:
            "Unable to process order at this time. Please try again later.",
        },
      };
    }
  }

  private async checkAllItemsAvailability(
    items: OrderItem[],
    contextLogger: any
  ): Promise<OrderCreationResult> {
    contextLogger.info("Checking inventory for all items", {
      itemCount: items.length,
    });

    try {
      // Prepare batch request
      const inventoryRequests = items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }));

      // Single batch call instead of multiple individual calls
      const inventoryResults = await inventoryService.checkBatchAvailability(
        inventoryRequests
      );

      // Check results and collect unavailable items
      const unavailableItems: UnavailableItem[] = [];

      inventoryResults.forEach((result, index) => {
        if (!result.available) {
          const item = items[index];
          unavailableItems.push({
            productId: item.productId,
            requested: item.quantity,
            available: result.availableQuantity || 0,
          });
        }
      });

      if (unavailableItems.length > 0) {
        contextLogger.warn("Items not available", {
          unavailableCount: unavailableItems.length,
        });
        return {
          success: false,
          error: {
            code: OrderErrorCode.INSUFFICIENT_INVENTORY,
            message: "Some items are not available in requested quantities",
            details: unavailableItems,
          },
        };
      }

      contextLogger.info("All items available in inventory");
      return { success: true };
    } catch (error) {
      contextLogger.error("Inventory check failed", {
        error: error instanceof Error ? error.message : error,
      });

      return {
        success: false,
        error: {
          code: OrderErrorCode.INVENTORY_SERVICE_UNAVAILABLE,
          message: "Unable to check inventory at this time",
        },
      };
    }
  }

  private async findOrderByIdempotencyKey(idempotencyKey: string) {
    return await db.query.orders.findFirst({
      where: eq(orders.idempotencyKey, idempotencyKey),
    });
  }

  private async createOrderWithOutbox(
    request: CreateOrderRequest,
    totalAmount: number,
    idempotencyKey: string | undefined,
    contextLogger: any
  ) {
    return await db.transaction(async (tx) => {
      // Create order
      const [order] = await tx
        .insert(orders)
        .values({
          customerId: request.customerId,
          items: request.items,
          totalAmount: totalAmount.toString(),
          status: ORDER_STATUS.PENDING_SHIPMENT,
          idempotencyKey,
        })
        .returning();

      // Create outbox event for reliable messaging
      const eventId = uuidv4();
      await tx.insert(outboxEvents).values({
        eventType: EVENT_TYPES.ORDER_CREATED,
        aggregateId: order.id,
        payload: {
          eventId,
          eventType: EVENT_TYPES.ORDER_CREATED,
          timestamp: new Date().toISOString(),
          orderId: order.id,
          customerId: order.customerId,
          items: order.items,
          totalAmount: order.totalAmount,
          status: order.status,
          createdAt: order.createdAt,
        },
      });

      contextLogger.info("Order and outbox event created in transaction", {
        orderId: order.id,
        eventId,
      });

      return order;
    });
  }

  private mapOrderToResponse(order: any): CreateOrderResponse {
    return {
      orderId: order.id,
      status: order.status,
      customerId: order.customerId,
      items: order.items,
      totalAmount: parseFloat(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
    };
  }

  async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    eventId: string,
    correlationId?: string
  ): Promise<OrderUpdateResult> {
    const contextLogger = logger.child({ correlationId, orderId });

    try {
      const result = await db.transaction(async (tx) => {
        // Check if event already processed (idempotency)
        const existingEvent = await tx.query.processedEvents.findFirst({
          where: eq(processedEvents.eventId, eventId),
        });

        if (existingEvent) {
          contextLogger.info("Event already processed, skipping", { eventId });
          return {
            success: false,
            error: {
              code: OrderErrorCode.DUPLICATE_EVENT,
              message: "Event already processed",
            },
          };
        }

        // Get current order
        const currentOrder = await tx.query.orders.findFirst({
          where: eq(orders.id, orderId),
        });

        if (!currentOrder) {
          return {
            success: false,
            error: {
              code: OrderErrorCode.ORDER_NOT_FOUND,
              message: `Order ${orderId} not found`,
            },
          };
        }

        // Validate status transition (forward-only)
        if (
          !this.isValidStatusTransition(
            currentOrder.status as OrderStatus,
            newStatus
          )
        ) {
          contextLogger.warn("Invalid status transition attempted", {
            currentStatus: currentOrder.status,
            newStatus,
          });
          return {
            success: false,
            error: {
              code: OrderErrorCode.INVALID_STATUS_TRANSITION,
              message: `Cannot transition from ${currentOrder.status} to ${newStatus}`,
            },
          };
        }

        // Update order status
        const [updatedOrder] = await tx
          .update(orders)
          .set({
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId))
          .returning();

        // Mark event as processed
        await tx.insert(processedEvents).values({
          eventId,
          eventType: `order.${newStatus.toLowerCase().replace(" ", "_")}`,
        });

        contextLogger.info("Order status updated", {
          oldStatus: currentOrder.status,
          newStatus: updatedOrder.status,
        });

        return {
          success: true,
          order: updatedOrder,
        };
      });

      return result;
    } catch (error) {
      contextLogger.error("Order status update failed", {
        error: error instanceof Error ? error.message : error,
      });

      return {
        success: false,
        error: {
          code: OrderErrorCode.INVENTORY_SERVICE_UNAVAILABLE,
          message: "Unable to update order status at this time",
        },
      };
    }
  }

  private isValidStatusTransition(
    currentStatus: OrderStatus,
    newStatus: OrderStatus
  ): boolean {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [ORDER_STATUS.PENDING_SHIPMENT]: [ORDER_STATUS.SHIPPED],
      [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED],
      [ORDER_STATUS.DELIVERED]: [], // Final state
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }
}

export const orderService = new OrderService();
