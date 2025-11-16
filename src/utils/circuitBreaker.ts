import { config } from "@/config/env";
import { logger } from "@/monitoring/logger";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime?: number;
  private nextAttempt?: number;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (this.shouldAttemptReset()) {
        this.state = "HALF_OPEN";
        logger.info("Circuit breaker: HALF_OPEN - attempting reset");
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }

    try {
      const result = await Promise.race([operation(), this.timeoutPromise()]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Operation timeout")),
        this.config.timeout
      );
    });
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
    logger.debug("Circuit breaker: SUCCESS - reset to CLOSED");
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = "OPEN";
      this.nextAttempt = Date.now() + this.config.resetTimeout;
      logger.warn(`Circuit breaker: OPEN - ${this.failureCount} failures`);
    }
  }

  private shouldAttemptReset(): boolean {
    return this.nextAttempt ? Date.now() >= this.nextAttempt : false;
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
    };
  }
}

// Global circuit breaker instance for inventory service
export const inventoryCircuitBreaker = new CircuitBreaker({
  failureThreshold: config.circuitBreaker.failureThreshold,
  timeout: config.circuitBreaker.timeout,
  resetTimeout: config.circuitBreaker.resetTimeout,
});
