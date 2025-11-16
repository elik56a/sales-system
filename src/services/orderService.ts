import { db } from "@/database/connection";
import {
  orders,
  outboxEvents,
  processedEvents,
  type Order,
} from "@/database/schema";
import { inventoryService } from "@/services/inventoryService";
import {
  OrderStatus,
  OrderCreationResult,
  OrderUpdateResult,
  OrderErrorCode,
  OrderItem,
  CreateOrderResponse,
  ORDER_STATUS,
  DatabaseTransaction,
  CreateOrderRequest,
} from "@/types";
import { EVENT_TYPES } from "@/config/events";
import { logger, type ContextLogger } from "@/monitoring/logger";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export class OrderService {
  async createOrder(
    request: CreateOrderRequest,
    idempotencyKey?: string,
    correlationId?: string
  ): Promise<OrderCreationResult> {
    const contextLogger = this.createLogger(correlationId, request.customerId);

    try {
      contextLogger.info("Creating order", { itemCount: request.items.length });

      const idempotencyResult = await this.handleIdempotency(
        idempotencyKey,
        contextLogger
      );
      if (idempotencyResult) return idempotencyResult;

      const inventoryResult = await this.validateInventory(
        request.items,
        contextLogger
      );
      if (!inventoryResult.success) return inventoryResult;

      const totalAmount = this.calculateTotal(request.items);
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

      return this.createSuccessResult(order);
    } catch (error) {
      return this.handleOrderCreationError(error, contextLogger);
    }
  }

  // Helper methods for createOrder
  private createLogger = (correlationId?: string, customerId?: string) => {
    return logger.child({ correlationId, customerId });
  };

  private handleIdempotency = async (
    idempotencyKey: string | undefined,
    contextLogger: ContextLogger
  ) => {
    if (!idempotencyKey) return null;

    const existingOrder = await this.findOrderByIdempotencyKey(idempotencyKey);
    if (existingOrder) {
      contextLogger.info("Returning existing order (idempotent)", {
        orderId: existingOrder.id,
      });
      return this.createSuccessResult(existingOrder);
    }
    return null;
  };

  private validateInventory = async (
    items: OrderItem[],
    contextLogger: ContextLogger
  ): Promise<OrderCreationResult> => {
    return await inventoryService.validateOrderInventory(items, contextLogger);
  };

  private calculateTotal = (items: OrderItem[]): number => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  private createSuccessResult = (order: Order): OrderCreationResult => {
    return {
      success: true,
      order: this.mapOrderToResponse(order),
    };
  };

  private handleOrderCreationError = (
    error: unknown,
    contextLogger: ContextLogger
  ): OrderCreationResult => {
    contextLogger.error("Order creation failed", {
      error: error instanceof Error ? error.message : error,
    });

    return {
      success: false,
      error: {
        code: OrderErrorCode.INVENTORY_SERVICE_UNAVAILABLE,
        message:
          "Unable to process order at this time. Please try again later.",
      },
    };
  };

  private async findOrderByIdempotencyKey(idempotencyKey: string) {
    return await db.query.orders.findFirst({
      where: eq(orders.idempotencyKey, idempotencyKey),
    });
  }

  private async createOrderWithOutbox(
    request: CreateOrderRequest,
    totalAmount: number,
    idempotencyKey: string | undefined,
    contextLogger: ContextLogger
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

  private mapOrderToResponse(order: Order): CreateOrderResponse {
    return {
      orderId: order.id,
      status: order.status,
      customerId: order.customerId,
      items: order.items as OrderItem[],
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
    const contextLogger = this.createLogger(correlationId, undefined);

    try {
      const result = await db.transaction(async (tx) => {
        const duplicateCheck = await this.checkDuplicateEvent(
          tx,
          eventId,
          contextLogger
        );
        if (duplicateCheck) return duplicateCheck;

        const currentOrder = await this.findOrderById(tx, orderId);
        if (!currentOrder) return this.createOrderNotFoundError(orderId);

        const transitionValidation = this.validateStatusTransition(
          currentOrder,
          newStatus,
          contextLogger
        );
        if (transitionValidation) return transitionValidation;

        const updatedOrder = await this.performStatusUpdate(
          tx,
          orderId,
          newStatus,
          eventId
        );

        contextLogger.info("Order status updated", {
          oldStatus: currentOrder.status,
          newStatus: updatedOrder.status,
        });

        return { success: true, order: updatedOrder };
      });

      return result;
    } catch (error) {
      return this.handleStatusUpdateError(error, contextLogger);
    }
  }

  private checkDuplicateEvent = async (
    tx: DatabaseTransaction,
    eventId: string,
    contextLogger: ContextLogger
  ) => {
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
    return null;
  };

  private findOrderById = async (tx: DatabaseTransaction, orderId: string) => {
    return await tx.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
  };

  private createOrderNotFoundError = (orderId: string): OrderUpdateResult => {
    return {
      success: false,
      error: {
        code: OrderErrorCode.ORDER_NOT_FOUND,
        message: `Order ${orderId} not found`,
      },
    };
  };

  private validateStatusTransition = (
    currentOrder: any,
    newStatus: OrderStatus,
    contextLogger: ContextLogger
  ) => {
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
    return null;
  };

  private performStatusUpdate = async (
    tx: DatabaseTransaction,
    orderId: string,
    newStatus: OrderStatus,
    eventId: string
  ): Promise<Order> => {
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    await tx.insert(processedEvents).values({
      eventId,
      eventType: `order.${newStatus.toLowerCase().replace(" ", "_")}`,
    });

    return updatedOrder;
  };

  private handleStatusUpdateError = (
    error: unknown,
    contextLogger: ContextLogger
  ): OrderUpdateResult => {
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
  };

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
