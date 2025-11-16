import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5000, // High throughput for load testing (83 req/sec)
  message: {
    error: "Too Many Requests",
    message: "Rate limit exceeded. Try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for health checks
  skip: (req) => req.path === "/health",
  handler: (req, res) => {
    res.status(429).json({
      error: "Too Many Requests",
      message: "Rate limit exceeded. Try again later.",
      correlationId: req.correlationId,
    });
  },
});
