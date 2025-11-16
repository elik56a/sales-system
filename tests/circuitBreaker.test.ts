import { CircuitBreaker } from "../src/utils/circuitBreaker";
import { inventoryService } from "../src/services/inventoryService";

// Mock the logger to avoid console output during tests
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

describe("CircuitBreaker", () => {
  it("should execute operation when closed", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      timeout: 1000,
      resetTimeout: 5000,
    });

    const mockOperation = jest.fn().mockResolvedValue("success");
    const result = await cb.execute(mockOperation);

    expect(result).toBe("success");
    expect(cb.getState().state).toBe("CLOSED");
  });

  it("should open circuit after threshold failures", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      timeout: 1000,
      resetTimeout: 5000,
    });

    const mockOperation = jest.fn().mockRejectedValue(new Error("failure"));

    // First failure
    await expect(cb.execute(mockOperation)).rejects.toThrow("failure");
    expect(cb.getState().state).toBe("CLOSED");

    // Second failure - should open circuit
    await expect(cb.execute(mockOperation)).rejects.toThrow("failure");
    expect(cb.getState().state).toBe("OPEN");

    // Third attempt - should fail fast
    await expect(cb.execute(mockOperation)).rejects.toThrow(
      "Circuit breaker is OPEN"
    );
  });
});

describe("InventoryService", () => {
  it("should check availability for normal products", async () => {
    const result = await inventoryService.checkAvailability({
      productId: "normal-product",
      quantity: 5,
    });

    expect(result.available).toBe(true);
    expect(result.productId).toBe("normal-product");
    expect(result.availableQuantity).toBeGreaterThanOrEqual(5);
  });

  it("should return unavailable for out-of-stock products", async () => {
    const result = await inventoryService.checkAvailability({
      productId: "out-of-stock-product",
      quantity: 1,
    });

    expect(result.available).toBe(false);
    expect(result.availableQuantity).toBe(0);
  });
});
