import { mockQueue } from "@/messaging/mockQueue";
import { orderService } from "@/services/orderService";
import { logger } from "@/monitoring/logger";
import { EVENT_TYPES, TOPICS } from "@/config/events";
import { OrderStatus, ORDER_STATUS } from "@/types";
import { QueueEvent, DeliveryStatusEvent } from "@/types/messaging";
import { generateCorrelationId } from "@/utils/idGenerator";
import dotenv from "dotenv";

dotenv.config();
class StatusConsumer {
  private isRunning = false;

  start(): void {
    if (this.isRunning) {
      logger.warn("Status consumer already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting status consumer");

    // Subscribe to delivery events
    mockQueue.subscribe(TOPICS.DELIVERY_EVENTS, (event) =>
      this.handleDeliveryEvent(event)
    );
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info("Status consumer stopped");
  }

  private async handleDeliveryEvent(event: QueueEvent): Promise<void> {
    const correlationId = generateCorrelationId();
    const contextLogger = logger.child({
      correlationId,
      eventId: event.eventId,
    });

    try {
      const { eventType } = event;

      // Type guard to ensure it's a delivery status event
      if (!this.isDeliveryStatusEvent(event)) {
        contextLogger.debug("Ignoring non-delivery-status event", {
          eventType,
        });
        return;
      }

      const { orderId } = event;

      if (!orderId) {
        contextLogger.warn("Invalid event format - missing orderId", { event });
        return;
      }

      let newStatus: OrderStatus;

      if (eventType === EVENT_TYPES.ORDER_SHIPPED) {
        newStatus = ORDER_STATUS.SHIPPED;
      } else if (eventType === EVENT_TYPES.ORDER_DELIVERED) {
        newStatus = ORDER_STATUS.DELIVERED;
      } else {
        contextLogger.debug("Ignoring non-status event", { eventType });
        return;
      }

      contextLogger.info("Processing status update", { orderId, newStatus });

      const result = await orderService.updateOrderStatus(
        orderId,
        newStatus,
        event.eventId,
        correlationId
      );

      if (result.success) {
        contextLogger.info("Status updated successfully", {
          orderId,
          newStatus,
        });
      } else {
        contextLogger.warn("Status update failed", {
          orderId,
          error: result.error?.message,
        });
      }
    } catch (error) {
      contextLogger.error("Error processing delivery event", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  private isDeliveryStatusEvent(
    event: QueueEvent
  ): event is DeliveryStatusEvent {
    return (
      event.eventType === EVENT_TYPES.ORDER_SHIPPED ||
      event.eventType === EVENT_TYPES.ORDER_DELIVERED
    );
  }
}

// Global status consumer instance
export const statusConsumer = new StatusConsumer();

// Auto-start if this file is run directly
if (require.main === module) {
  statusConsumer.start();

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, stopping status consumer...");
    statusConsumer.stop();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    logger.info("Received SIGINT, stopping status consumer...");
    statusConsumer.stop();
    process.exit(0);
  });

  // Keep the process alive
  setInterval(() => {}, 1000);
}
