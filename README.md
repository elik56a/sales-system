# Sales System Implementation
## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker
- pnpm

### 1. Install & Setup
```bash
# Clone and install
pnpm install

# Setup environment
cp .env.example .env

# Start PostgreSQL Running on Docker
pnpm run db:start

# Setup database schema and seed data
pnpm run db:setup

# Start the application
pnpm run dev
```

**⚠️ Important**: Always run `pnpm run db:start` before `pnpm run db:setup`. The database must be running and ready for schema creation to work.



### 3. Using Docker
```bash
docker-compose up
```

## 🐳 Deployment Options

### Option 1: Hybrid Development (Recommended)
**Database in Docker + Application Local**
```bash
pnpm run db:start    # PostgreSQL in Docker
pnpm run db:setup    # Setup schema
pnpm run dev         # Application runs locally
```
**Benefits**: Fast development, easy debugging, hot reload

### Option 2: Full Docker
**Everything Containerized**
```bash
docker-compose up    # Database + Application in containers
```
**Benefits**: Production-like environment, consistent across teams


## 📋 Available Scripts

```bash
pnpm run dev          # Start API + background workers
pnpm run dev:api      # Start API only
pnpm run dev:outbox   # Start outbox publisher only
pnpm run dev:consumer # Start status consumer only
pnpm run build        # Build for production
pnpm start            # Run production build
pnpm test             # Run tests
pnpm run db:start     # Start PostgreSQL via Docker
pnpm run db:stop      # Stop PostgreSQL container
pnpm run db:create    # Create sales_db database
pnpm run db:setup     # Create DB + setup schema and seed
```

## 🏗️ Architecture

**Single Application with Background Workers:**
- **Sales API** - REST endpoint for order creation
- **Outbox Publisher** - Publishes events from database to queue
- **Delivery Service** - Processes orders and publishes status updates
- **Status Consumer** - Consumes delivery status updates
- **Mock Queue** - Simulates Kafka for development

**Key Features:**
- ✅ Transactional Outbox Pattern
- ✅ Circuit Breaker for external services
- ✅ Idempotency handling
- ✅ Event-driven architecture
- ✅ Dead Letter Queue (DLQ)
- ✅ Exponential backoff retry
- ✅ Full TypeScript type safety
- ✅ Automatic delivery processing

## 📁 Project Structure

```
src/
├── api/              # HTTP controllers, routes, middleware
├── workers/          # Background workers (outbox, consumer)
├── services/         # Business logic (order, inventory)
├── database/         # Schema, connection, seeding
├── messaging/        # Mock queue implementation
├── monitoring/       # Health checks, logging
├── utils/            # Circuit breaker, validation utilities
├── types/            # TypeScript type definitions
└── config/           # Environment and event configurations
```

## 🔧 Configuration

Key environment variables in `.env`:

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/sales_db

# API
PORT=3000
JWT_SECRET=your-secret-key

# Circuit Breaker
CIRCUIT_BREAKER_TIMEOUT=5000
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5

# Outbox Publisher
OUTBOX_POLL_INTERVAL=1000
```

## 🚨 Troubleshooting

### Database Connection Issues
If you get `ECONNREFUSED` errors:

```bash
# 1. Ensure PostgreSQL is running
pnpm run db:start

# 2. Wait a few seconds for startup, then setup
pnpm run db:setup

# 3. If still failing, restart the database
pnpm run db:stop
pnpm run db:start
pnpm run db:setup
```

### Docker Issues
```bash
# Clean slate (if needed)
docker stop postgres && docker rm postgres
pnpm run db:start
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm run test:coverage

# Run specific tests
pnpm test orderService
pnpm test outboxPublisher
```

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

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "order-789",
    "status": "Pending Shipment",
    "customerId": "customer-123",
    "items": [...],
    "totalAmount": 59.98,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Simulate Delivery Status
```http
POST /api/orders/:orderId/simulate-delivery
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "status": "shipped"  // or "delivered"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Simulated shipped event for order order-789"
}
```

### Health Check
```http
GET /health
```

## 🔄 Event Flow

1. **Order Creation** → Database (order + outbox event)
2. **Outbox Publisher** → Mock Queue (`order.created`)
3. **Delivery Service** → Processes order automatically (2-8 seconds)
4. **Delivery Service** → Mock Queue (`order.shipped`, `order.delivered`)
5. **Status Consumer** → Database (order status updated)

## 🛠️ Development Notes

- **Inventory Service**: Mocked with configurable responses
- **JWT Authentication**: Accepts any valid JWT for demo
- **Mock Queue**: Simulates Kafka messaging
- **Single Process**: API + workers for simplicity

## 🚀 Production Considerations

- **Circuit Breaker**: Prevents cascade failures
- **Retry Logic**: Exponential backoff (100-1600ms)
- **Idempotency**: Client and event-level duplicate handling
- **Health Monitoring**: Database connectivity checks
- **Structured Logging**: JSON logs with correlation IDs

---

**Author**: Eliyahu Kriel  
**Date**: November 2025
# sales-system
