import { statusConsumer } from "../src/workers/statusConsumer";
import { mockQueue } from "../src/messaging/mockQueue";
import { orderService } from "../src/services/orderService";
import { EVENT_TYPES, TOPICS } from "../src/config/events";
import { DeliveryStatusEvent } from "../src/types/messaging";
import { generateEventId } from "../src/utils/idGenerator";

// Mock the logger and order service
jest.mock("../src/monitoring/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock("../src/services/orderService", () => ({
  orderService: {
    updateOrderStatus: jest.fn(),
  },
}));

describe("StatusConsumer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueue.clear();
  });

  it("should process order.shipped events", async () => {
    const mockUpdateOrderStatus = orderService.updateOrderStatus as jest.Mock;
    mockUpdateOrderStatus.mockResolvedValue({ success: true });

    statusConsumer.start();

    // Create and publish delivery event
    const shippedEvent: DeliveryStatusEvent = {
      eventId: generateEventId("test"),
      eventType: EVENT_TYPES.ORDER_SHIPPED,
      orderId: "order-123",
      timestamp: new Date().toISOString(),
    };

    await mockQueue.publish(TOPICS.DELIVERY_EVENTS, shippedEvent);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
      "order-123",
      "Shipped",
      expect.any(String),
      expect.any(String)
    );

    statusConsumer.stop();
  });

  it("should process order.delivered events", async () => {
    const mockUpdateOrderStatus = orderService.updateOrderStatus as jest.Mock;
    mockUpdateOrderStatus.mockResolvedValue({ success: true });

    statusConsumer.start();

    // Create and publish delivery event
    const deliveredEvent: DeliveryStatusEvent = {
      eventId: generateEventId("test"),
      eventType: EVENT_TYPES.ORDER_DELIVERED,
      orderId: "order-456",
      timestamp: new Date().toISOString(),
    };

    await mockQueue.publish(TOPICS.DELIVERY_EVENTS, deliveredEvent);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
      "order-456",
      "Delivered",
      expect.any(String),
      expect.any(String)
    );

    statusConsumer.stop();
  });
});
