import { Request, Response, NextFunction } from "express";
import { logger } from "@/monitoring/logger";

interface QueuedRequest {
  req: Request;
  res: Response;
  next: NextFunction;
  timestamp: number;
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = 0;
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private readonly timeoutMs: number;

  constructor(
    maxConcurrent = 50, // Process max 50 requests concurrently
    maxQueueSize = 1000, // Queue up to 1000 requests
    timeoutMs = 30000 // 30 second timeout
  ) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.timeoutMs = timeoutMs;
  }

  middleware = (req: Request, res: Response, next: NextFunction) => {
    // Skip queuing for health checks
    if (req.path === "/health") {
      return next();
    }

    // If we can process immediately, do so
    if (this.processing < this.maxConcurrent) {
      this.processing++;

      // Set up cleanup when request finishes
      const cleanup = () => {
        this.processing--;
        this.processNext();
      };

      res.on("finish", cleanup);
      res.on("close", cleanup);
      res.on("error", cleanup);

      return next();
    }

    // Check if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn("Request queue full, rejecting request", {
        queueSize: this.queue.length,
        processing: this.processing,
        path: req.path,
      });

      return res.status(503).json({
        error: "Service Temporarily Unavailable",
        message: "Server is at capacity. Please try again later.",
        correlationId: req.correlationId,
      });
    }

    // Add to queue
    const queuedRequest: QueuedRequest = {
      req,
      res,
      next,
      timestamp: Date.now(),
    };

    this.queue.push(queuedRequest);

    logger.info("Request queued", {
      queueSize: this.queue.length,
      processing: this.processing,
      path: req.path,
      correlationId: req.correlationId,
    });

    // Set timeout for queued request
    setTimeout(() => {
      const index = this.queue.findIndex((item) => item === queuedRequest);
      if (index !== -1) {
        this.queue.splice(index, 1);

        if (!res.headersSent) {
          res.status(408).json({
            error: "Request Timeout",
            message: "Request timed out while waiting in queue.",
            correlationId: req.correlationId,
          });
        }
      }
    }, this.timeoutMs);
  };

  private processNext() {
    if (this.queue.length === 0 || this.processing >= this.maxConcurrent) {
      return;
    }

    const queuedRequest = this.queue.shift();
    if (!queuedRequest) {
      return;
    }

    const { req, res, next } = queuedRequest;

    // Check if request timed out
    if (res.headersSent) {
      this.processNext(); // Try next request
      return;
    }

    this.processing++;

    // Set up cleanup when request finishes
    const cleanup = () => {
      this.processing--;
      this.processNext();
    };

    res.on("finish", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);

    const queueTime = Date.now() - queuedRequest.timestamp;

    logger.info("Processing queued request", {
      queueTime,
      queueSize: this.queue.length,
      processing: this.processing,
      path: req.path,
      correlationId: req.correlationId,
    });

    next();
  }

  getStats() {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
    };
  }
}

// Export singleton instance
export const requestQueue = new RequestQueue();
export const queueMiddleware = requestQueue.middleware;
