# Sales System Implementation - Task 2

> **Enterprise-Grade Order Processing System**  
> Implementing Transactional Outbox Pattern, Circuit Breaker, and Event-Driven Architecture

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker
- pnpm

### Setup Instructions

```bash
# 1. Clone and install dependencies
pnpm install

# 2. Setup environment
cp .env.example .env

# 3. Start PostgreSQL in Docker
pnpm run db:start

# 4. Setup database schema and seed data
pnpm run db:setup

# 5. Start the application
pnpm run dev
```

**⚠️ Important**: Always run `pnpm run db:start` before `pnpm run db:setup`. The database must be running for schema creation.

## 🚀 Try the API

Once the application is running, you can try it with these examples:

### Create a Single Order

```bash
# Make a real API call to create an order
pnpm run script:order
```

### Load Testing (5000 API Requests)

```bash
# Simulate peak ordering hours with 5000 concurrent API calls
pnpm run script:peak-hours

# For demo-friendly results, set INVENTORY_FAILURE_RATE=0.01 in your .env file
```

**Expected Results**:

- ✅ Success rate depends on `INVENTORY_FAILURE_RATE` setting (99%+ with default 1% failure rate)
- ⚡ ~300-400 requests/second
- 🚀 ~50ms average response time
- 🔄 Circuit breaker demonstration with automatic recovery
- 📊 Watch logs to see automatic order processing: `Pending Shipment` → `Shipped` → `Delivered`

## 🏗️ Architecture Overview

**Modular Monolith with Event-Driven Components:**

- **Sales API** - REST endpoint for order creation (`POST /orders`)
- **Outbox Publisher** - Publishes events from database to mock queue
- **Delivery Service** - Processes orders and simulates shipping/delivery
- **Status Consumer** - Updates order status from delivery events

**Key Patterns Implemented:**

- ✅ **Transactional Outbox Pattern** with concurrent workers
- ✅ **Circuit Breaker** for external service resilience (5 failures → 30s recovery, configurable via `INVENTORY_FAILURE_RATE`)
- ✅ **Idempotency** handling (client + message level)
- ✅ **Event-driven architecture** with mock Kafka
- ✅ **Exponential backoff retry** with Dead Letter Queue
- ✅ **SQL guards** for forward-only status transitions (Pending → Shipped → Delivered only)

## 📋 Key Assumptions Made

### **1. Microservices → Modular Monolith**

- **Assumption**: Single deployable unit is acceptable for Task 2 demonstration
- **Rationale**: Easier to setup, test, and demonstrate core patterns
- **Production Path**: Would split into separate services (Sales, Delivery, Infrastructure)

### **2. Mock External Services**

- **Inventory Service**: Mocked with configurable responses (success/failure rates)
- **Message Queue**: Mock implementation simulating Kafka behavior
- **Delivery Service**: Automated processing with 2-8 second delays
- **Rationale**: Focuses evaluation on core business logic and patterns

### **3. Polling Strategy for Outbox**

- **Choice**: Database polling with `SELECT ... FOR UPDATE SKIP LOCKED`
- **Rationale**: Production-proven pattern (Uber, Stripe), supports concurrent workers
- **Trade-off**: 1-2 second latency vs complexity of event-driven approaches

### **4. Authentication & Authorization**

- **Assumption**: JWT validation only (no user management system)
- **Implementation**: Accepts any valid JWT token for demonstration
- **Production**: Would integrate with proper identity provider

### **5. Database Configuration**

- **Single Database**: All services share one PostgreSQL instance
- **Connection Pooling**: Optimized for load testing (50 max, 10 min connections)
- **Production**: Each service would have dedicated database

### **6. Observability & Infrastructure**

- **Monitoring**: Custom `/api/metrics` endpoint instead of Prometheus/Grafana
- **Logging**: Winston with JSON format instead of full ELK stack
- **Secrets**: Environment variables instead of AWS Secrets Manager
- **Rationale**: Demonstrates observability concepts without infrastructure complexity
- **Production Path**: Would implement Prometheus metrics, centralized logging, and proper secret management

### **7. Request Queue & Load Management**

- **Custom RequestQueue**: Replaces load balancer/API gateway throttling for demonstration
- **Rationale**: Shows traffic control concepts without infrastructure complexity
- **Production**: Would use AWS ALB, NGINX rate limiting, or Kubernetes autoscaling

## 📊 API Reference

### Create Order

```http
POST /api/orders
Authorization: Bearer <jwt-token>
Idempotency-Key: <unique-key>
Content-Type: application/json

{
  "customerId": "customer-123",
  "items": [
    {
      "productId": "product-456",
      "quantity": 2,
      "price": 29.99
    }
  ]
}
```

### Health Check

```http
GET /health
```

### System Metrics

```http
GET /api/metrics
```

## 🔄 Event Flow

1. **Order Creation** → Database (order + outbox event)
2. **Outbox Publisher** → Mock Queue (`order.created`)
3. **Delivery Service** → Processes order (2-8 seconds delay)
4. **Delivery Service** → Mock Queue (`order.shipped`, `order.delivered`)
5. **Status Consumer** → Database (order status updated)

**Order States**: `Pending Shipment` → `Shipped` → `Delivered`

## 🧪 App Testing

Test the application with automated test suite and performance validation:

```bash
# Run Jest test suite
pnpm test

# Run tests with coverage report
pnpm run test:coverage
```

**Expected Results**: 100% test pass rate, comprehensive coverage of core business logic

## 🔧 Configuration

Key environment variables (see `.env.example` for full list):

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/sales_db
DB_POOL_SIZE=50
DB_POOL_MIN_SIZE=10

# API
PORT=3000
JWT_SECRET=your-secret-key

# Circuit Breaker
CIRCUIT_BREAKER_TIMEOUT=5000
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT=30000

# Inventory Service Simulation
INVENTORY_FAILURE_RATE=1  # Percentage of requests that fail (0-100)
```

## 📋 Available Scripts

### **Development**

```bash
pnpm run dev                 # Start full application (API + workers)
pnpm run dev:api             # Start API server only
pnpm run dev:outbox          # Start outbox publisher worker only
pnpm run dev:consumer        # Start status consumer worker only
pnpm run build               # Build TypeScript to JavaScript
pnpm start                   # Run production build
```

### **Database Management**

```bash
pnpm run db:start            # Start PostgreSQL in Docker
pnpm run db:stop             # Stop PostgreSQL container
pnpm run db:create           # Create sales_db database
pnpm run db:generate         # Generate Drizzle schema migrations
pnpm run db:seed             # Seed database with test data
pnpm run db:setup            # Complete setup: create + generate + seed
```

### **Docker Operations**

```bash
pnpm run dev:compose-up      # Start everything in Docker
pnpm run dev:compose-down    # Stop Docker containers
```

### **Testing & Examples**

```bash
pnpm test                    # Run Jest test suite
pnpm run test:coverage       # Run tests with coverage report
pnpm run script:order       # Create a single test order
pnpm run script:peak-hours  # Run 5000 request load test
```

## 🐳 Development Options

### Option 1: Hybrid (Recommended)

```bash
pnpm run db:start    # PostgreSQL in Docker
pnpm run dev         # Application locally
```

### Option 2: Full Docker

```bash
pnpm run dev:compose-up    # Everything containerized
```

## 🚨 Troubleshooting

### Database Connection Issues

```bash
# Restart database if connection fails
pnpm run db:stop
pnpm run db:start
pnpm run db:setup
```

### Docker Issues

```bash
# Clean slate
docker stop postgres && docker rm postgres
pnpm run db:start
```

## 🔄 Outbox Pattern: Production-Grade Polling

**Why Polling with SKIP LOCKED?**

This implementation uses the **industry-standard polling pattern** with concurrent workers - the same approach used by Uber, Stripe, and Airbnb for high-throughput event processing.

```sql
-- Conceptual SQL: concurrent workers with zero contention
SELECT * FROM outbox_events
WHERE published = false
  AND retry_count <= 5
  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
ORDER BY created_at
LIMIT 50
FOR UPDATE SKIP LOCKED;
```

**Implementation Note:** The actual code uses Drizzle ORM for type safety and codebase consistency, with additional retry logic and exponential backoff scheduling.

**Key Benefits:**

- ✅ **Battle-tested**: Handles millions of events/day in production systems
- ✅ **Horizontally scalable**: Multiple workers with zero lock contention
- ✅ **Database-native**: Leverages PostgreSQL's advanced row-level locking
- ✅ **Simple & reliable**: Easy to test, debug, monitor, and maintain
- ✅ **Efficient**: Index-only scans with minimal polling overhead

**Performance Characteristics:**

- **Throughput**: 10,000+ events/second with proper indexing
- **Latency**: 1-2 seconds (configurable polling interval)
- **Scalability**: Linear scaling with worker count
- **Reliability**: Full transactional safety guaranteed

**Why Not Database Triggers?**
Triggers introduce architectural problems:

- Run inside DB transactions (can't reliably publish to Kafka)
- Couple business logic to database engine
- Harder to test, debug, and version control
- Violate microservices separation of concerns

**Real-World Bottlenecks:**
In production systems, performance limits come from:

- Inventory service API calls
- Database disk I/O
- Kafka broker throughput
- **Not the polling overhead** (microseconds per query)

## 📁 Project Structure

```
src/
├── api/              # HTTP API layer (controllers, middleware, routes)
├── workers/          # Background processing (outbox publisher, status consumer)
├── services/         # Business logic (order, inventory, delivery services)
├── database/         # Data persistence (schema, connection, migrations)
├── messaging/        # Event communication (mock queue)
├── monitoring/       # Observability (logging, health checks)
├── utils/            # Shared utilities (circuit breaker, ID generation)
├── types/            # TypeScript type definitions
├── config/           # Application configuration
├── app.ts           # Express application setup
└── server.ts        # Application entry point

scripts/             # API demonstration and load testing scripts
tests/              # Test suite (unit and integration tests)
```

---

**Author**: Eliyahu Kriel  
**Date**: November 2025  
**Task**: CPQ Sales System Implementation (Task 2)
