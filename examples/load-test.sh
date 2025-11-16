#!/bin/bash

# Load Test Example - Create multiple orders
echo "🚀 Running load test - creating 5 orders..."

for i in {1..5000}; do
  echo "Creating order $i..."
  
  curl -X POST http://localhost:3000/api/orders \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTc2MzI0NzQ3OX0.pavEIVCQN3SIIC_rbtq-YRXr7Rmy6atxb_oy7iuOLbw" \
    -H "Idempotency-Key: load-test-$i-$(date +%s)" \
    -d "{
      \"customerId\": \"customer-$i\",
      \"items\": [
        {\"productId\": \"product-$((i * 100))\", \"quantity\": $i, \"price\": $((i * 10)).99}
      ]
    }" | jq '.data.orderId'
  
  sleep 1
done

echo ""
echo "✅ Load test complete! Check logs for processing activity."
