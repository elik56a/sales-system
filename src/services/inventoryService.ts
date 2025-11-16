import { inventoryCircuitBreaker } from "@/utils/circuitBreaker";
import { config } from "@/config/env";
import { logger } from "@/monitoring/logger";
import { InventoryCheckRequest, InventoryCheckResponse } from "@/types";
import { generateCorrelationId } from "@/utils/idGenerator";

class InventoryService {
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
  private async mockBatchInventoryCheck(
    requests: InventoryCheckRequest[]
  ): Promise<InventoryCheckResponse[]> {
    // Simulate single network call for batch
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 100 + 50)
    );

    // Simulate batch processing error - configurable via environment variable
    // INVENTORY_FAILURE_RATE: percentage of requests that should fail (0-100)
    // Default: 1% failure rate for realistic testing
    const FAILURE_RATE =
      parseFloat(process.env.INVENTORY_FAILURE_RATE || "1") / 100;

    if (Math.random() < FAILURE_RATE) {
      throw new Error(
        "Inventory service temporary unavailable - simulated failure"
      );
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
