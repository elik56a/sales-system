import { orderService } from "../src/services/orderService";
import { inventoryService } from "../src/services/inventoryService";
import { db } from "../src/database/connection";
import { ORDER_STATUS, OrderErrorCode, OrderItem } from "../src/types";

// Mock all external dependencies
jest.mock("../src/services/inventoryService");
jest.mock("../src/database/connection");
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
const mockInventoryService = inventoryService as jest.Mocked<
  typeof inventoryService
>;
const mockDb = db as jest.Mocked<typeof db>;

describe("OrderService", () => {
  const validOrderRequest = {
    customerId: "customer-123",
    items: [
      { productId: "product-1", quantity: 2, price: 10.0 },
      { productId: "product-2", quantity: 1, price: 15.0 },
    ] as OrderItem[],
  };

  const mockOrder = {
    id: "order-123",
    customerId: "customer-123",
    items: validOrderRequest.items,
    totalAmount: "35.00",
    status: ORDER_STATUS.PENDING_SHIPMENT,
    createdAt: new Date("2024-01-01T10:00:00Z"),
    updatedAt: new Date("2024-01-01T10:00:00Z"),
    idempotencyKey: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createOrder", () => {
    describe("Success Cases", () => {
      it("should create order successfully when all items are available", async () => {
        // Arrange
        mockInventoryService.checkBatchAvailability.mockResolvedValue([
          { available: true, productId: "product-1", availableQuantity: 10 },
          { available: true, productId: "product-2", availableQuantity: 5 },
        ]);

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

        // Act
        const result = await orderService.createOrder(validOrderRequest);

        // Assert
        expect(result.success).toBe(true);
        expect(result.order).toBeDefined();
        expect(result.order?.orderId).toBe("order-123");
        expect(result.order?.status).toBe(ORDER_STATUS.PENDING_SHIPMENT);
        expect(result.order?.totalAmount).toBe(35.0);
        expect(result.order?.customerId).toBe("customer-123");
        expect(result.order?.items).toEqual(validOrderRequest.items);

        // Verify inventory was checked
        expect(
          mockInventoryService.checkBatchAvailability
        ).toHaveBeenCalledWith([
          { productId: "product-1", quantity: 2 },
          { productId: "product-2", quantity: 1 },
        ]);

        // Verify transaction was called
        expect(mockDb.transaction).toHaveBeenCalled();
      });

      it("should return existing order when idempotency key matches", async () => {
        // Arrange
        const existingOrder = {
          id: "existing-order-456",
          customerId: "customer-123",
          status: ORDER_STATUS.PENDING_SHIPMENT,
          totalAmount: "35.00",
          createdAt: new Date("2024-01-01T09:00:00Z"),
          items: validOrderRequest.items,
        };

        mockDb.query = {
          orders: {
            findFirst: jest.fn().mockResolvedValue(existingOrder),
          },
        } as any;

        // Act
        const result = await orderService.createOrder(
          validOrderRequest,
          "duplicate-key-123"
        );

        // Assert
        expect(result.success).toBe(true);
        expect(result.order?.orderId).toBe("existing-order-456");

        // Should not check inventory or create new order
        expect(
          mockInventoryService.checkBatchAvailability
        ).not.toHaveBeenCalled();
        expect(mockDb.transaction).not.toHaveBeenCalled();
      });
    });

    describe("Inventory Validation", () => {
      it("should fail when some items are not available", async () => {
        // Arrange
        mockInventoryService.checkBatchAvailability.mockResolvedValue([
          { available: false, productId: "product-1", availableQuantity: 1 }, // Not enough
          { available: true, productId: "product-2", availableQuantity: 5 }, // Available
        ]);

        // Act
        const result = await orderService.createOrder(validOrderRequest);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe(OrderErrorCode.INSUFFICIENT_INVENTORY);
        expect(result.error?.message).toBe(
          "Some items are not available in requested quantities"
        );
        expect(result.error?.details).toHaveLength(1);
        expect(result.error?.details?.[0]).toEqual({
          productId: "product-1",
          requested: 2,
          available: 1,
        });

        // Should not create order
        expect(mockDb.transaction).not.toHaveBeenCalled();
      });

      it("should handle inventory service errors gracefully", async () => {
        // Arrange
        mockInventoryService.checkBatchAvailability.mockRejectedValue(
          new Error("Inventory service timeout")
        );

        // Act
        const result = await orderService.createOrder(validOrderRequest);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe(
          OrderErrorCode.INVENTORY_SERVICE_UNAVAILABLE
        );
        expect(result.error?.message).toBe(
          "Unable to check inventory at this time"
        );
      });
    });
  });

  describe("updateOrderStatus", () => {
    describe("Success Cases", () => {
      it("should update order status successfully", async () => {
        // Arrange
        const currentOrder = {
          id: "order-123",
          status: ORDER_STATUS.PENDING_SHIPMENT,
        };

        const updatedOrder = {
          ...currentOrder,
          status: ORDER_STATUS.SHIPPED,
          updatedAt: new Date(),
        };

        mockDb.transaction.mockImplementation(async (callback) => {
          const mockTx = {
            query: {
              processedEvents: {
                findFirst: jest.fn().mockResolvedValue(null), // Event not processed yet
              },
              orders: {
                findFirst: jest.fn().mockResolvedValue(currentOrder),
              },
            },
            update: jest.fn().mockReturnValue({
              set: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue({
                  returning: jest.fn().mockResolvedValue([updatedOrder]),
                }),
              }),
            }),
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockResolvedValue(undefined),
            }),
          };
          return callback(mockTx as any);
        });

        // Act
        const result = await orderService.updateOrderStatus(
          "order-123",
          ORDER_STATUS.SHIPPED,
          "event-456",
          "correlation-123"
        );

        // Assert
        expect(result.success).toBe(true);
        expect(result.order?.status).toBe(ORDER_STATUS.SHIPPED);
      });
    });

    describe("Validation", () => {
      it("should fail when order not found", async () => {
        // Arrange
        mockDb.transaction.mockImplementation(async (callback) => {
          const mockTx = {
            query: {
              processedEvents: {
                findFirst: jest.fn().mockResolvedValue(null),
              },
              orders: {
                findFirst: jest.fn().mockResolvedValue(null), // Order not found
              },
            },
          };
          return callback(mockTx as any);
        });

        // Act
        const result = await orderService.updateOrderStatus(
          "non-existent-order",
          ORDER_STATUS.SHIPPED,
          "event-123"
        );

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe(OrderErrorCode.ORDER_NOT_FOUND);
        expect(result.error?.message).toBe(
          "Order non-existent-order not found"
        );
      });

      it("should reject invalid status transitions", async () => {
        // Arrange
        const deliveredOrder = {
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
                findFirst: jest.fn().mockResolvedValue(deliveredOrder),
              },
            },
          };
          return callback(mockTx as any);
        });

        // Act
        const result = await orderService.updateOrderStatus(
          "order-123",
          ORDER_STATUS.SHIPPED, // Invalid: can't go back from delivered
          "event-123"
        );

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe(
          OrderErrorCode.INVALID_STATUS_TRANSITION
        );
        expect(result.error?.message).toBe(
          "Cannot transition from Delivered to Shipped"
        );
      });

      it("should skip processing if event already processed", async () => {
        // Arrange
        const existingEvent = {
          eventId: "event-123",
          eventType: "order.shipped",
          processedAt: new Date(),
        };

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

        // Act
        const result = await orderService.updateOrderStatus(
          "order-123",
          ORDER_STATUS.SHIPPED,
          "event-123"
        );

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe(OrderErrorCode.DUPLICATE_EVENT);
        expect(result.error?.message).toBe("Event already processed");
      });
    });
  });
});
