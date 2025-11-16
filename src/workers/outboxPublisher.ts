import { db } from "@/database/connection";
import { outboxEvents, processedEvents } from "@/database/schema";
import { mockQueue } from "@/messaging/mockQueue";
import { logger } from "@/monitoring/logger";
import { EVENT_TYPES, TOPICS } from "@/config/events";
import { QueueEvent, DLQEvent } from "@/types/messaging";
import { generateEventId } from "@/utils/idGenerator";
import { eq, and, or, lte, isNull } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

interface OutboxEventRow {
  id: string;
  eventType: string;
  aggregateId: string;
  payload: QueueEvent;
  retryCount: number;
  createdAt: Date;
}

class OutboxPublisher {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private readonly pollIntervalMs = parseInt(
    process.env.OUTBOX_POLL_INTERVAL || "1000"
  );
  private readonly batchSize = 50;
  private readonly maxRetries = 5;
  private readonly baseDelayMs = 100;
  private readonly maxDelayMs = 1600;

  start(): void {
    if (this.isRunning) {
      logger.warn("Outbox publisher already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting outbox publisher", {
      pollInterval: this.pollIntervalMs,
      batchSize: this.batchSize,
      maxRetries: this.maxRetries,
    });

    this.intervalId = setInterval(() => {
      this.processOutboxEvents().catch((error) => {
        logger.error("Error in outbox publisher", {
          error: error instanceof Error ? error.message : error,
        });
      });
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    logger.info("Outbox publisher stopped");
  }

  private async processOutboxEvents(): Promise<void> {
    try {
      // Get unpublished events that need processing
      // Include events that haven't exceeded max retries AND events at max retries (for DLQ processing)
      // Process events where retry_count <= maxRetries AND (no scheduled retry OR retry time has passed)
      const events = await db
        .select({
          id: outboxEvents.id,
          eventType: outboxEvents.eventType,
          aggregateId: outboxEvents.aggregateId,
          payload: outboxEvents.payload,
          retryCount: outboxEvents.retryCount,
          createdAt: outboxEvents.createdAt,
        })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.published, false),
            lte(outboxEvents.retryCount, this.maxRetries),
            or(
              isNull(outboxEvents.nextRetryAt),
              lte(outboxEvents.nextRetryAt, new Date())
            )
          )
        )
        .orderBy(outboxEvents.createdAt)
        .limit(this.batchSize)
        .for("update", { skipLocked: true });

      if (events.length === 0) {
        return;
      }

      logger.info("Processing outbox events", {
        events,
      });

      // Process events in parallel
      await Promise.allSettled(
        events.map((event) => this.publishEvent(event as OutboxEventRow))
      );
    } catch (error) {
      logger.error("Failed to process outbox events", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  private async publishEvent(event: OutboxEventRow): Promise<void> {
    const correlationId = `outbox-${event.id}`;
    const contextLogger = logger.child({ correlationId, eventId: event.id });

    try {
      const topic = this.getTopicForEventType(event.eventType);

      // Publish to mock queue
      await mockQueue.publish(topic, event.payload);

      // Mark as published and record in processed_events using transaction
      await db.transaction(async (tx) => {
        // Update outbox event as published
        await tx
          .update(outboxEvents)
          .set({
            published: true,
            publishedAt: new Date(),
          })
          .where(eq(outboxEvents.id, event.id));

        // Record successful publication in processed_events
        await tx.insert(processedEvents).values({
          eventId: event.payload.eventId,
          eventType: event.eventType,
        });
      });

      contextLogger.info("Event published successfully", {
        eventType: event.eventType,
        topic,
        aggregateId: event.aggregateId,
      });
    } catch (error) {
      contextLogger.error("Failed to publish event", {
        error: error instanceof Error ? error.message : error,
        eventType: event.eventType,
      });

      await this.handleRetry(event, contextLogger);
    }
  }

  private async handleRetry(
    event: OutboxEventRow,
    contextLogger: any
  ): Promise<void> {
    const newRetryCount = event.retryCount + 1;

    if (newRetryCount >= this.maxRetries) {
      contextLogger.error("Event exceeded max retries, moving to DLQ", {
        retryCount: newRetryCount,
        maxRetries: this.maxRetries,
      });

      await this.moveToDeadLetterQueue(event);
    } else {
      // Exponential backoff
      const delayMs = Math.min(
        this.baseDelayMs * Math.pow(2, newRetryCount - 1),
        this.maxDelayMs
      );
      const nextRetryAt = new Date(Date.now() + delayMs);

      // Update retry info using Drizzle
      await db
        .update(outboxEvents)
        .set({
          retryCount: newRetryCount,
          nextRetryAt,
        })
        .where(eq(outboxEvents.id, event.id));

      contextLogger.warn("Event retry scheduled", {
        retryCount: newRetryCount,
        maxRetries: this.maxRetries,
        nextRetryAt: nextRetryAt.toISOString(),
        delayMs,
      });
    }
  }

  private getTopicForEventType(eventType: string): string {
    switch (eventType) {
      case EVENT_TYPES.ORDER_CREATED:
        return TOPICS.ORDER_EVENTS;
      case EVENT_TYPES.ORDER_SHIPPED:
      case EVENT_TYPES.ORDER_DELIVERED:
        return TOPICS.DELIVERY_EVENTS;
      default:
        return "unknown-events";
    }
  }

  private async moveToDeadLetterQueue(event: OutboxEventRow): Promise<void> {
    // Mark as published to stop retrying
    await db
      .update(outboxEvents)
      .set({
        published: true,
        publishedAt: new Date(),
      })
      .where(eq(outboxEvents.id, event.id));

    // Create DLQ event
    const dlqEvent: DLQEvent = {
      eventId: generateEventId("dlq"),
      eventType: "dlq.event",
      timestamp: new Date().toISOString(),
      originalEvent: event,
      reason: "Max retries exceeded",
    };

    // Publish to DLQ topic
    await mockQueue.publish(TOPICS.DEAD_LETTER_QUEUE, dlqEvent);

    logger.error("Event moved to dead letter queue", {
      eventId: event.id,
      eventType: event.eventType,
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      pollInterval: this.pollIntervalMs,
      batchSize: this.batchSize,
      maxRetries: this.maxRetries,
      backoffRange: `${this.baseDelayMs}-${this.maxDelayMs}ms`,
    };
  }
}

// Global outbox publisher instance
export const outboxPublisher = new OutboxPublisher();

// Auto-start if this file is run directly
if (require.main === module) {
  outboxPublisher.start();

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, stopping outbox publisher...");
    outboxPublisher.stop();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    logger.info("Received SIGINT, stopping outbox publisher...");
    outboxPublisher.stop();
    process.exit(0);
  });

  // Keep the process alive
  setInterval(() => {}, 1000);
}
