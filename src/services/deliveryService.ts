import { mockQueue } from "@/messaging/mockQueue";
import { logger } from "@/monitoring/logger";
import { EVENT_TYPES, TOPICS } from "@/config/events";
import {
  DeliveryStatusEvent,
  OrderCreatedEvent,
  QueueEvent,
} from "@/types/messaging";
import { generateEventId, generateCorrelationId } from "@/utils/idGenerator";

class DeliveryService {
  private isRunning = false;

  start(): void {
    if (this.isRunning) {
      logger.warn("Delivery service already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting delivery service");

    // Subscribe to order created events
    mockQueue.subscribe(TOPICS.ORDER_EVENTS, (event) =>
      this.handleOrderCreated(event)
    );
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info("Delivery service stopped");
  }

  private async handleOrderCreated(event: QueueEvent): Promise<void> {
    const correlationId = generateCorrelationId();
    const contextLogger = logger.child({
      correlationId,
      eventId: event.eventId,
    });

    console.log("handleOrderCreated event", event);

    try {
      if (event.eventType !== EVENT_TYPES.ORDER_CREATED) {
        return; // Ignore non-order-created events
      }

      // Type guard to ensure it's an order created event
      if (!this.isOrderCreatedEvent(event)) {
        contextLogger.warn("Invalid order created event format", { event });
        return;
      }

      const { orderId } = event;

      if (!orderId) {
        contextLogger.warn("Invalid order created event - missing orderId", {
          event,
        });
        return;
      }

      contextLogger.info("Processing order for delivery", { orderId });

      const shippingDelay = 10000; //10 seconds
      const deliveryDelay = shippingDelay + 10000; //20 seconds

      // Schedule shipping status
      setTimeout(() => {
        this.publishStatusUpdate(
          orderId,
          EVENT_TYPES.ORDER_SHIPPED,
          contextLogger
        );
      }, shippingDelay);

      // Schedule delivery status
      setTimeout(() => {
        this.publishStatusUpdate(
          orderId,
          EVENT_TYPES.ORDER_DELIVERED,
          contextLogger
        );
      }, deliveryDelay);
    } catch (error) {
      contextLogger.error("Error processing order for delivery", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  private publishStatusUpdate(
    orderId: string,
    eventType:
      | typeof EVENT_TYPES.ORDER_SHIPPED
      | typeof EVENT_TYPES.ORDER_DELIVERED,
    contextLogger: any
  ): void {
    const statusEvent: DeliveryStatusEvent = {
      eventId: generateEventId("delivery"),
      eventType,
      orderId,
      timestamp: new Date().toISOString(),
    };

    mockQueue.publish(TOPICS.DELIVERY_EVENTS, statusEvent);

    contextLogger.info(`Order ${statusEvent.eventType}`, {
      orderId,
      eventType,
      eventId: statusEvent.eventId,
    });
  }

  private isOrderCreatedEvent(event: QueueEvent): event is OrderCreatedEvent {
    return (
      event.eventType === EVENT_TYPES.ORDER_CREATED &&
      "orderId" in event &&
      "customerId" in event
    );
  }
}

export const deliveryService = new DeliveryService();
