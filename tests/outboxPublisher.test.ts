import { outboxPublisher } from "../src/workers/outboxPublisher";
import { mockQueue } from "../src/messaging/mockQueue";
import { db } from "../src/database/connection";
import { outboxEvents } from "../src/database/schema";
import { EVENT_TYPES, TOPICS } from "../src/config/events";

// Mock dependencies
jest.mock("../src/database/connection");
jest.mock("../src/messaging/mockQueue");
jest.mock("../src/monitoring/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    })),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockMockQueue = mockQueue as jest.Mocked<typeof mockQueue>;

describe("OutboxPublisher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    outboxPublisher.stop();
  });

  describe("processOutboxEvents", () => {
    it("should publish unpublished events successfully", async () => {
      const mockEvents = [
        {
          id: "event-1",
          eventType: EVENT_TYPES.ORDER_CREATED,
          aggregateId: "order-123",
          payload: {
            eventId: "event-1",
            eventType: EVENT_TYPES.ORDER_CREATED,
            orderId: "order-123",
            customerId: "customer-123",
            timestamp: new Date().toISOString(),
          },
          retryCount: 0,
          createdAt: new Date(),
        },
      ];

      // Mock database select
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                for: jest.fn().mockResolvedValue(mockEvents),
              }),
            }),
          }),
        }),
      } as any);

      // Mock database update
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      } as any);

      // Mock queue publish
      mockMockQueue.publish.mockResolvedValue();

      // Access private method for direct testing
      const publisher = outboxPublisher as any;
      await publisher.processOutboxEvents();

      expect(mockMockQueue.publish).toHaveBeenCalledWith(
        TOPICS.ORDER_EVENTS,
        mockEvents[0].payload
      );
    });

    it("should handle publishing failures with retry", async () => {
      const mockEvent = {
        id: "event-1",
        eventType: EVENT_TYPES.ORDER_CREATED,
        aggregateId: "order-123",
        payload: { eventId: "event-1", eventType: EVENT_TYPES.ORDER_CREATED },
        retryCount: 0,
        createdAt: new Date(),
      };

      // Mock database select
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                for: jest.fn().mockResolvedValue([mockEvent]),
              }),
            }),
          }),
        }),
      } as any);

      // Mock database update for retry
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      } as any);

      // Mock queue publish failure
      mockMockQueue.publish.mockRejectedValue(new Error("Queue unavailable"));

      const publisher = outboxPublisher as any;
      await publisher.processOutboxEvents();

      // Should update retry count
      expect(mockDb.update).toHaveBeenCalledWith(outboxEvents);
    });

    it("should move events to DLQ after max retries", async () => {
      const mockEvent = {
        id: "event-1",
        eventType: EVENT_TYPES.ORDER_CREATED,
        aggregateId: "order-123",
        payload: { eventId: "event-1", eventType: EVENT_TYPES.ORDER_CREATED },
        retryCount: 5, // Max retries reached
        createdAt: new Date(),
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                for: jest.fn().mockResolvedValue([mockEvent]),
              }),
            }),
          }),
        }),
      } as any);

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      } as any);

      mockMockQueue.publish.mockRejectedValue(new Error("Queue unavailable"));

      const publisher = outboxPublisher as any;
      await publisher.processOutboxEvents();

      // Should publish to DLQ
      expect(mockMockQueue.publish).toHaveBeenCalledWith(
        TOPICS.DEAD_LETTER_QUEUE,
        expect.objectContaining({
          originalEvent: mockEvent,
          reason: "Max retries exceeded",
        })
      );
    });

    it("should route events to correct topics", async () => {
      const orderCreatedEvent = {
        id: "event-1",
        eventType: EVENT_TYPES.ORDER_CREATED,
        aggregateId: "order-123",
        payload: { eventId: "event-1", eventType: EVENT_TYPES.ORDER_CREATED },
        retryCount: 0,
        createdAt: new Date(),
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                for: jest.fn().mockResolvedValue([orderCreatedEvent]),
              }),
            }),
          }),
        }),
      } as any);

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      } as any);

      mockMockQueue.publish.mockResolvedValue();

      const publisher = outboxPublisher as any;
      await publisher.processOutboxEvents();

      expect(mockMockQueue.publish).toHaveBeenCalledWith(
        TOPICS.ORDER_EVENTS,
        orderCreatedEvent.payload
      );
    });

    it("should skip processing when no events found", async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                for: jest.fn().mockResolvedValue([]), // No events
              }),
            }),
          }),
        }),
      } as any);

      const publisher = outboxPublisher as any;
      await publisher.processOutboxEvents();

      expect(mockMockQueue.publish).not.toHaveBeenCalled();
    });
  });

  describe("start/stop", () => {
    it("should start and stop correctly", () => {
      expect(outboxPublisher.getStatus().isRunning).toBe(false);

      outboxPublisher.start();
      expect(outboxPublisher.getStatus().isRunning).toBe(true);

      outboxPublisher.stop();
      expect(outboxPublisher.getStatus().isRunning).toBe(false);
    });

    it("should not start if already running", () => {
      outboxPublisher.start();
      const firstStatus = outboxPublisher.getStatus();

      outboxPublisher.start(); // Try to start again
      const secondStatus = outboxPublisher.getStatus();

      expect(firstStatus.isRunning).toBe(true);
      expect(secondStatus.isRunning).toBe(true);
    });
  });
});
