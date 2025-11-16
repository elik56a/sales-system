# API Examples

This folder contains example scripts to test the Sales System API.

## Prerequisites

- API server running on `http://localhost:3000`
- `jq` installed for JSON formatting: `brew install jq` (macOS) or `apt install jq` (Linux)

## Available Examples

### 1. Health Check

```bash
./health-check.sh
```

Checks if the API is running and healthy.

### 2. Create Order

```bash
./create-order.sh
```

Creates a sample order and shows automatic delivery processing.

### 3. Simulate Delivery

```bash
./simulate-delivery.sh <order-id>
```

Manually triggers delivery status updates for an order.

Example:

```bash
./simulate-delivery.sh order-abc123
```

### 4. Load Test

```bash
./load-test.sh
```

Creates multiple orders to test system performance and event processing.

## Running Examples

Make scripts executable:

```bash
chmod +x examples/*.sh
```

Run individual examples:

```bash
cd examples
./create-order.sh
```

Or use npm scripts:

```bash
pnpm run example:health
pnpm run example:order
pnpm run example:load-test
```

## Expected Flow

1. **Create Order** → Order stored with "Pending Shipment" status
2. **Outbox Publisher** → Publishes `order.created` event
3. **Delivery Service** → Processes order (2-8 seconds delay)
4. **Status Updates** → Automatically transitions: Shipped → Delivered
5. **Event Consumer** → Updates order status in database

Watch the application logs to see the complete event flow!
