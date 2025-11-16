import { inventoryCircuitBreaker } from "@/utils/circuitBreaker";
import { logger } from "@/monitoring/logger";
import {
  InventoryCheckRequest,
  InventoryCheckResponse,
  OrderItem,
  OrderCreationResult,
  OrderErrorCode,
  UnavailableItem,
} from "@/types";
import { generateCorrelationId } from "@/utils/idGenerator";
import type { ContextLogger } from "@/monitoring/logger";

class InventoryService {
  async checkBatchAvailability(
    requests: InventoryCheckRequest[]
  ): Promise<InventoryCheckResponse[]> {
    const correlationId = generateCorrelationId();
    const contextLogger = logger.child({
      correlationId,
      productCount: requests.length,
    });

    contextLogger.info("Calling external inventory API", {
      products: requests.map((r) => r.productId),
    });

    try {
      const results = await inventoryCircuitBreaker.execute(async () => {
        return this.callExternalInventoryAPI(requests);
      });

      contextLogger.info("External inventory API call completed", {
        total: results.length,
        available: results.filter((r) => r.available).length,
        unavailable: results.filter((r) => !r.available).length,
      });

      return results;
    } catch (error) {
      contextLogger.error("External inventory API failed", {
        error: error instanceof Error ? error.message : error,
      });
      throw new Error("Inventory service unavailable");
    }
  }
  private async callExternalInventoryAPI(
    requests: InventoryCheckRequest[]
  ): Promise<InventoryCheckResponse[]> {
    // Simulate network latency
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 100 + 50)
    );

    // Simulate API failures (configurable for testing)
    const FAILURE_RATE =
      parseFloat(process.env.INVENTORY_FAILURE_RATE || "1") / 100;
    if (Math.random() < FAILURE_RATE) {
      throw new Error("External inventory API temporarily unavailable");
    }

    // Mock external API response
    return this.mockInventoryAPIResponse(requests);
  }

  private mockInventoryAPIResponse(
    requests: InventoryCheckRequest[]
  ): InventoryCheckResponse[] {
    return requests.map((request) => {
      const { productId, quantity } = request;

      // Mock different product scenarios
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

  // Order inventory validation - moved from utils
  async validateOrderInventory(
    items: OrderItem[],
    contextLogger: ContextLogger
  ): Promise<OrderCreationResult> {
    contextLogger.info("Validating inventory for order", {
      itemCount: items.length,
    });

    try {
      const inventoryRequests = this.prepareInventoryRequests(items);
      const inventoryResults =
        await this.checkBatchAvailability(inventoryRequests);
      const unavailableItems = this.findUnavailableItems(
        items,
        inventoryResults
      );

      if (this.hasUnavailableItems(unavailableItems)) {
        return this.createInventoryErrorResult(unavailableItems, contextLogger);
      }

      contextLogger.info("All items available in inventory");
      return { success: true };
    } catch (error) {
      return this.handleInventoryError(error, contextLogger);
    }
  }

  // Helper methods for inventory validation
  private prepareInventoryRequests(
    items: OrderItem[]
  ): InventoryCheckRequest[] {
    return items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
  }

  private findUnavailableItems(
    items: OrderItem[],
    inventoryResults: InventoryCheckResponse[]
  ): UnavailableItem[] {
    return inventoryResults
      .map((result, index) => ({ result, item: items[index] }))
      .filter(({ result }) => !result.available)
      .map(({ result, item }) => ({
        productId: item.productId,
        requested: item.quantity,
        available: result.availableQuantity || 0,
      }));
  }

  private hasUnavailableItems(unavailableItems: UnavailableItem[]): boolean {
    return unavailableItems.length > 0;
  }

  private createInventoryErrorResult(
    unavailableItems: UnavailableItem[],
    contextLogger: ContextLogger
  ): OrderCreationResult {
    contextLogger.warn("Items not available", {
      unavailableCount: unavailableItems.length,
    });

    return {
      success: false,
      error: {
        code: OrderErrorCode.INSUFFICIENT_INVENTORY,
        message: "Some items are not available in requested quantities",
        details: unavailableItems,
      },
    };
  }

  private handleInventoryError(
    error: unknown,
    contextLogger: ContextLogger
  ): OrderCreationResult {
    contextLogger.error("Inventory validation failed", {
      error: error instanceof Error ? error.message : error,
    });

    return {
      success: false,
      error: {
        code: OrderErrorCode.INVENTORY_SERVICE_UNAVAILABLE,
        message: "Unable to check inventory at this time",
      },
    };
  }
}

export const inventoryService = new InventoryService();
