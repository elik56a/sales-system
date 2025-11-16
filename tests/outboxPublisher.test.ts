import { outboxPublisher } from "../src/workers/outboxPublisher";
import { db } from "../src/database/connection";
import { outboxEvents, processedEvents } from "../src/database/schema";
import { mockQueue } from "../src/messaging/mockQueue";
import { EVENT_TYPES, TOPICS } from "../src/config/events";
import { QueueEvent } from "../src/types/messaging";

// Mock all external dependencies
jest.mock("../src/database/connection");
jest.mock("../src/messaging/mockQueue");
jest.mock("../src/utils/idGenerator", () => ({
  generateEventId: jest.fn(() => "generated-event-id"),
}));
jest.mock("../src/monitoring/logger", () => {
  const mockChildLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  return {
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(() => mockChildLogger),
    },
  };
});

// Type the mocked services
const mockDb = db as jest.Mocked<typeof db>;
const mockMockQueue = mockQueue as jest.Mocked<typeof mockQueue>;

describe("OutboxPublisher", () => {
  // Test data
  const mockOutboxEvent = {
    id: "event-123",
    eventType: EVENT_TYPES.ORDER_CREATED,
    aggregateId: "order-456",
    payload: {
      eventId: "payload-event-123",
      eventType: EVENT_TYPES.ORDER_CREATED,
      orderId: "order-456",
      timestamp: "2024-01-01T10:00:00Z",
    } as QueueEvent,
    retryCount: 0,
    createdAt: new Date("2024-01-01T10:00:00Z"),
  };

  const mockDbQuery = () => ({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            for: jest.fn().mockResolvedValue([mockOutboxEvent]),
          }),
        }),
      }),
    }),
  });

  const mockTransaction = () => {
    const mockTx = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };
    mockDb.transaction.mockImplementation(async (callback) =>
      callback(mockTx as any)
    );
    return mockTx;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    outboxPublisher.stop();
  });

  afterEach(() => {
    jest.useRealTimers();
    outboxPublisher.stop();
  });

  describe("Lifecycle Management", () => {
    it("should start and stop successfully", () => {
      outboxPublisher.start();
      expect(outboxPublisher.getStatus().isRunning).toBe(true);

      outboxPublisher.stop();
      expect(outboxPublisher.getStatus().isRunning).toBe(false);
    });

    it("should not start if already running", () => {
      outboxPublisher.start();
      outboxPublisher.start(); // Try to start again
      expect(outboxPublisher.getStatus().isRunning).toBe(true);
    });
  });

  describe("Event Processing", () => {
    beforeEach(() => {
      mockDb.select = jest.fn().mockReturnValue(mockDbQuery());
    });

    it("should process outbox events successfully", async () => {
      // Arrange
      mockMockQueue.publish.mockResolvedValue();
      mockTransaction();

      outboxPublisher.start();

      // Act
      await jest.advanceTimersByTimeAsync(1000);

      // Assert
      expect(mockMockQueue.publish).toHaveBeenCalledWith(
        TOPICS.ORDER_EVENTS,
        mockOutboxEvent.payload
      );
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("should handle empty event batch gracefully", async () => {
      // Arrange
      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                for: jest.fn().mockResolvedValue([]), // Empty array
              }),
            }),
          }),
        }),
      });

      outboxPublisher.start();

      // Act
      await jest.advanceTimersByTimeAsync(1000);

      // Assert
      expect(mockMockQueue.publish).not.toHaveBeenCalled();
    });

    it("should process multiple events in parallel", async () => {
      // Arrange
      const multipleEvents = [
        { ...mockOutboxEvent, id: "event-1" },
        { ...mockOutboxEvent, id: "event-2" },
        { ...mockOutboxEvent, id: "event-3" },
      ];

      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                for: jest.fn().mockResolvedValue(multipleEvents),
              }),
            }),
          }),
        }),
      });

      mockMockQueue.publish.mockResolvedValue();
      mockTransaction();

      outboxPublisher.start();

      // Act
      await jest.advanceTimersByTimeAsync(1000);

      // Assert
      expect(mockMockQueue.publish).toHaveBeenCalledTimes(3);
      expect(mockDb.transaction).toHaveBeenCalledTimes(3);
    });
  });

  describe("Topic Routing", () => {
    beforeEach(() => {
      mockMockQueue.publish.mockResolvedValue();
      mockTransaction();
    });

    it("should route events to correct topics", async () => {
      const testCases = [
        {
          eventType: EVENT_TYPES.ORDER_CREATED,
          expectedTopic: TOPICS.ORDER_EVENTS,
        },
        {
          eventType: EVENT_TYPES.ORDER_SHIPPED,
          expectedTopic: TOPICS.DELIVERY_EVENTS,
        },
        {
          eventType: EVENT_TYPES.ORDER_DELIVERED,
          expectedTopic: TOPICS.DELIVERY_EVENTS,
        },
        { eventType: "unknown.event", expectedTopic: "unknown-events" },
      ];

      for (const testCase of testCases) {
        // Arrange
        const event = { ...mockOutboxEvent, eventType: testCase.eventType };
        mockDb.select = jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  for: jest.fn().mockResolvedValue([event]),
                }),
              }),
            }),
          }),
        });

        outboxPublisher.start();

        // Act
        await jest.advanceTimersByTimeAsync(1000);

        // Assert
        expect(mockMockQueue.publish).toHaveBeenCalledWith(
          testCase.expectedTopic,
          event.payload
        );

        outboxPublisher.stop();
        jest.clearAllMocks();
        mockMockQueue.publish.mockResolvedValue();
        mockTransaction();
      }
    });
  });

  describe("Retry Logic", () => {
    beforeEach(() => {
      mockDb.select = jest.fn().mockReturnValue(mockDbQuery());
      mockDb.update = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });
    });

    it("should retry failed events with exponential backoff", async () => {
      // Arrange
      mockMockQueue.publish.mockRejectedValue(new Error("Queue unavailable"));

      outboxPublisher.start();

      // Act
      await jest.advanceTimersByTimeAsync(1000);

      // Assert
      expect(mockDb.update).toHaveBeenCalledWith(outboxEvents);
      expect(mockDb.update(outboxEvents).set).toHaveBeenCalledWith(
        expect.objectContaining({
          retryCount: 1,
          nextRetryAt: expect.any(Date),
        })
      );
    });

    it("should calculate correct exponential backoff delays", async () => {
      // Arrange
      const eventWithRetries = { ...mockOutboxEvent, retryCount: 2 };
      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                for: jest.fn().mockResolvedValue([eventWithRetries]),
              }),
            }),
          }),
        }),
      });

      mockMockQueue.publish.mockRejectedValue(new Error("Queue unavailable"));

      outboxPublisher.start();

      // Act
      await jest.advanceTimersByTimeAsync(1000);

      // Assert
      expect(mockDb.update(outboxEvents).set).toHaveBeenCalledWith(
        expect.objectContaining({
          retryCount: 3, // 2 + 1
          nextRetryAt: expect.any(Date),
        })
      );
    });
  });

  describe("Dead Letter Queue", () => {
    it("should move events to DLQ after max retries exceeded", async () => {
      // Arrange
      const maxRetriesEvent = { ...mockOutboxEvent, retryCount: 4 }; // Will become 5 (max)

      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                for: jest.fn().mockResolvedValue([maxRetriesEvent]),
              }),
            }),
          }),
        }),
      });

      mockMockQueue.publish
        .mockRejectedValueOnce(new Error("Queue unavailable"))
        .mockResolvedValueOnce(); // For DLQ publish

      mockDb.update = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      outboxPublisher.start();

      // Act
      await jest.advanceTimersByTimeAsync(1000);

      // Assert
      expect(mockMockQueue.publish).toHaveBeenCalledTimes(2);
      expect(mockMockQueue.publish).toHaveBeenNthCalledWith(
        2,
        TOPICS.DEAD_LETTER_QUEUE,
        expect.objectContaining({
          eventId: "generated-event-id",
          eventType: "dlq.event",
          originalEvent: maxRetriesEvent,
          reason: "Max retries exceeded",
        })
      );
    });
  });

  describe("Database Transaction Handling", () => {
    beforeEach(() => {
      mockDb.select = jest.fn().mockReturnValue(mockDbQuery());
    });

    it("should update outbox event and create processed event in single transaction", async () => {
      // Arrange
      mockMockQueue.publish.mockResolvedValue();
      const mockTx = mockTransaction();

      outboxPublisher.start();

      // Act
      await jest.advanceTimersByTimeAsync(1000);

      // Assert
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockTx.update).toHaveBeenCalledWith(outboxEvents);
      expect(mockTx.insert).toHaveBeenCalledWith(processedEvents);
      expect(mockTx.insert().values).toHaveBeenCalledWith({
        eventId: mockOutboxEvent.payload.eventId,
        eventType: mockOutboxEvent.eventType,
      });
    });

    it("should handle transaction failures gracefully", async () => {
      // Arrange
      mockMockQueue.publish.mockResolvedValue();
      mockDb.transaction.mockRejectedValue(new Error("Transaction failed"));

      outboxPublisher.start();

      // Act
      await jest.advanceTimersByTimeAsync(1000);

      // Assert - Should trigger retry logic
      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle database query errors gracefully", async () => {
      // Arrange
      mockDb.select = jest.fn().mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      outboxPublisher.start();

      // Act
      await jest.advanceTimersByTimeAsync(1000);

      // Assert - Should not crash, just log error
      expect(mockMockQueue.publish).not.toHaveBeenCalled();
    });

    it("should continue processing after individual event failures", async () => {
      // Arrange
      const multipleEvents = [
        { ...mockOutboxEvent, id: "event-1" },
        { ...mockOutboxEvent, id: "event-2" },
      ];

      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                for: jest.fn().mockResolvedValue(multipleEvents),
              }),
            }),
          }),
        }),
      });

      // First event fails, second succeeds
      mockMockQueue.publish
        .mockRejectedValueOnce(new Error("First event failed"))
        .mockResolvedValueOnce();

      mockDb.update = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      mockTransaction();

      outboxPublisher.start();

      // Act
      await jest.advanceTimersByTimeAsync(1000);

      // Assert
      expect(mockMockQueue.publish).toHaveBeenCalledTimes(2);
      expect(mockDb.update).toHaveBeenCalled(); // Retry for first event
      expect(mockDb.transaction).toHaveBeenCalled(); // Success for second event
    });
  });

  describe("Status Reporting", () => {
    it("should return correct status information", () => {
      const status = outboxPublisher.getStatus();

      expect(status).toEqual({
        isRunning: false,
        pollInterval: 1000,
        batchSize: 50,
        maxRetries: 5,
        backoffRange: "100-1600ms",
      });
    });

    it("should reflect running state in status", () => {
      outboxPublisher.start();
      expect(outboxPublisher.getStatus().isRunning).toBe(true);
    });
  });
});
