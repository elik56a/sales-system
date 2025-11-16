#!/bin/bash

# Create Order Example
echo "🛒 Creating a new order..."

curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTc2MzI0NzQ3OX0.pavEIVCQN3SIIC_rbtq-YRXr7Rmy6atxb_oy7iuOLbw" \
  -H "Idempotency-Key: order-$(date +%s)" \
  -d '{
    "customerId": "customer-123",
    "items": [
      {"productId": "product-456", "quantity": 2, "price": 29.99},
      {"productId": "product-789", "quantity": 1, "price": 49.99}
    ]
  }' | jq '.'

echo ""
echo "✅ Order created! Check the logs to see automatic delivery processing..."
