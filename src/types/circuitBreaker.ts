// Circuit breaker utility types
export interface CircuitBreakerState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failureCount: number;
  lastFailureTime?: number;
  nextAttempt?: number;
}
