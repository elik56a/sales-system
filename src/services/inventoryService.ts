import { inventoryCircuitBreaker } from "@/utils/circuitBreaker";
import { config } from "@/config/env";
import { logger } from "@/monitoring/logger";
import { InventoryCheckRequest, InventoryCheckResponse } from "@/types";
import { generateCorrelationId } from "@/utils/idGenerator";

class InventoryService {
  async checkAvailability(
    request: InventoryCheckRequest
  ): Promise<InventoryCheckResponse> {
    const correlationId = generateCorrelationId();
    const contextLogger = logger.child({
      correlationId,
      productId: request.productId,
    });

    try {
      contextLogger.info("Checking inventory availability", {
        quantity: request.quantity,
      });

      const result = await inventoryCircuitBreaker.execute(async () => {
        return this.mockInventoryCheck(request);
      });

      contextLogger.info("Inventory check completed", {
        available: result.available,
      });
      return result;
    } catch (error) {
      contextLogger.error("Inventory check failed", {
        error: error instanceof Error ? error.message : error,
      });

      // Circuit breaker is open or service unavailable
      throw new Error("Inventory service unavailable");
    }
  }

  async checkBatchAvailability(
    requests: InventoryCheckRequest[]
  ): Promise<InventoryCheckResponse[]> {
    const correlationId = generateCorrelationId();
    const contextLogger = logger.child({
      correlationId,
      productCount: requests.length,
    });

    try {
      contextLogger.info("Checking batch inventory availability", {
        products: requests.map((r) => r.productId),
      });

      const results = await inventoryCircuitBreaker.execute(async () => {
        return this.mockBatchInventoryCheck(requests);
      });

      const unavailableCount = results.filter((r) => !r.available).length;
      contextLogger.info("Batch inventory check completed", {
        total: results.length,
        available: results.length - unavailableCount,
        unavailable: unavailableCount,
      });

      return results;
    } catch (error) {
      contextLogger.error("Batch inventory check failed", {
        error: error instanceof Error ? error.message : error,
      });

      throw new Error("Inventory service unavailable");
    }
  }

  private async mockInventoryCheck(
    request: InventoryCheckRequest
  ): Promise<InventoryCheckResponse> {
    // Simulate network delay
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 100 + 50)
    );

    // Mock logic: simulate different scenarios
    const { productId, quantity } = request;

    // Simulate some products being out of stock
    if (productId.includes("out-of-stock")) {
      return {
        available: false,
        productId,
        availableQuantity: 0,
      };
    }

    // Simulate limited stock
    if (productId.includes("limited")) {
      const availableQuantity = Math.floor(Math.random() * 5) + 1;
      return {
        available: quantity <= availableQuantity,
        productId,
        availableQuantity,
      };
    }

    // Simulate service errors (1% chance)
    if (Math.random() < 0.01) {
      throw new Error("Inventory service internal error");
    }

    // Default: product is available
    return {
      available: true,
      productId,
      availableQuantity: Math.floor(Math.random() * 100) + quantity,
    };
  }

  private async mockBatchInventoryCheck(
    requests: InventoryCheckRequest[]
  ): Promise<InventoryCheckResponse[]> {
    // Simulate single network call for batch
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 150 + 100)
    );

    // Simulate batch processing (1% chance of service error)
    if (Math.random() < 0.01) {
      throw new Error("Inventory service internal error");
    }

    return requests.map((request) => {
      const { productId, quantity } = request;

      // Same logic as single check but in batch
      if (productId.includes("out-of-stock")) {
        return {
          available: false,
          productId,
          availableQuantity: 0,
        };
      }

      if (productId.includes("limited")) {
        const availableQuantity = Math.floor(Math.random() * 5) + 1;
        return {
          available: quantity <= availableQuantity,
          productId,
          availableQuantity,
        };
      }

      return {
        available: true,
        productId,
        availableQuantity: Math.floor(Math.random() * 100) + quantity,
      };
    });
  }

  getCircuitBreakerStatus() {
    return inventoryCircuitBreaker.getState();
  }
}

export const inventoryService = new InventoryService();
