import { orderService } from "../src/services/orderService";
import { inventoryService } from "../src/services/inventoryService";
import { db } from "../src/database/connection";
import { orders, outboxEvents } from "../src/database/schema";
import { ORDER_STATUS, OrderErrorCode } from "../src/types";

// Mock dependencies
jest.mock("../src/services/inventoryService");
jest.mock("../src/database/connection");
jest.mock("../src/monitoring/logger", () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    })),
  },
}));

const mockInventoryService = inventoryService as jest.Mocked<
  typeof inventoryService
>;
const mockDb = db as jest.Mocked<typeof db>;

describe("OrderService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createOrder", () => {
    const validOrderRequest = {
      customerId: "customer-123",
      items: [
        { productId: "product-1", quantity: 2, price: 10.0 },
        { productId: "product-2", quantity: 1, price: 15.0 },
      ],
    };

    it("should create order successfully when inventory is available", async () => {
      // Mock inventory check
      mockInventoryService.checkBatchAvailability.mockResolvedValue([
        { available: true, productId: "product-1", availableQuantity: 10 },
        { available: true, productId: "product-2", availableQuantity: 5 },
      ]);

      // Mock database transaction
      const mockOrder = {
        id: "order-123",
        customerId: "customer-123",
        items: validOrderRequest.items,
        totalAmount: "35.00",
        status: ORDER_STATUS.PENDING_SHIPMENT,
        createdAt: new Date(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([mockOrder]),
            }),
          }),
        };
        return callback(mockTx as any);
      });

      const result = await orderService.createOrder(validOrderRequest);

      expect(result.success).toBe(true);
      expect(result.order?.orderId).toBe("order-123");
      expect(result.order?.status).toBe(ORDER_STATUS.PENDING_SHIPMENT);
      expect(result.order?.totalAmount).toBe(35.0);
    });

    it("should fail when inventory is insufficient", async () => {
      // Mock inventory check with insufficient stock
      mockInventoryService.checkBatchAvailability.mockResolvedValue([
        { available: false, productId: "product-1", availableQuantity: 1 },
        { available: true, productId: "product-2", availableQuantity: 5 },
      ]);

      const result = await orderService.createOrder(validOrderRequest);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(OrderErrorCode.INSUFFICIENT_INVENTORY);
      expect(result.error?.details).toHaveLength(1);
      expect(result.error?.details[0].productId).toBe("product-1");
    });

    it("should return existing order for duplicate idempotency key", async () => {
      const existingOrder = {
        id: "existing-order",
        customerId: "customer-123",
        status: ORDER_STATUS.PENDING_SHIPMENT,
        totalAmount: "35.00",
        createdAt: new Date(),
      };

      mockDb.query = {
        orders: {
          findFirst: jest.fn().mockResolvedValue(existingOrder),
        },
      } as any;

      const result = await orderService.createOrder(
        validOrderRequest,
        "duplicate-key"
      );

      expect(result.success).toBe(true);
      expect(result.order?.orderId).toBe("existing-order");
      expect(
        mockInventoryService.checkBatchAvailability
      ).not.toHaveBeenCalled();
    });

    it("should handle inventory service errors", async () => {
      mockInventoryService.checkBatchAvailability.mockRejectedValue(
        new Error("Service unavailable")
      );

      const result = await orderService.createOrder(validOrderRequest);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(
        OrderErrorCode.INVENTORY_SERVICE_UNAVAILABLE
      );
    });
  });

  describe("updateOrderStatus", () => {
    it("should update order status successfully", async () => {
      const mockOrder = {
        id: "order-123",
        status: ORDER_STATUS.PENDING_SHIPMENT,
      };

      const mockUpdatedOrder = {
        ...mockOrder,
        status: ORDER_STATUS.SHIPPED,
        updatedAt: new Date(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          query: {
            processedEvents: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
            orders: {
              findFirst: jest.fn().mockResolvedValue(mockOrder),
            },
          },
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([mockUpdatedOrder]),
              }),
            }),
          }),
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockResolvedValue(undefined),
          }),
        };
        return callback(mockTx as any);
      });

      const result = await orderService.updateOrderStatus(
        "order-123",
        ORDER_STATUS.SHIPPED,
        "event-123"
      );

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(ORDER_STATUS.SHIPPED);
    });

    it("should reject invalid status transitions", async () => {
      const mockOrder = {
        id: "order-123",
        status: ORDER_STATUS.DELIVERED, // Final state
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          query: {
            processedEvents: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
            orders: {
              findFirst: jest.fn().mockResolvedValue(mockOrder),
            },
          },
        };
        return callback(mockTx as any);
      });

      const result = await orderService.updateOrderStatus(
        "order-123",
        ORDER_STATUS.SHIPPED, // Invalid: can't go back from delivered
        "event-123"
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(OrderErrorCode.INVALID_STATUS_TRANSITION);
    });

    it("should skip duplicate events", async () => {
      const existingEvent = { eventId: "event-123" };

      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          query: {
            processedEvents: {
              findFirst: jest.fn().mockResolvedValue(existingEvent),
            },
          },
        };
        return callback(mockTx as any);
      });

      const result = await orderService.updateOrderStatus(
        "order-123",
        ORDER_STATUS.SHIPPED,
        "event-123"
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(OrderErrorCode.DUPLICATE_EVENT);
    });
  });
});
