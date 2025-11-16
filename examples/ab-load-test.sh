#!/bin/bash

# Apache Bench Load Test - Professional tool
echo "🚀 Running Apache Bench load test..."

# Create request data file
cat > /tmp/order-data.json << EOF
{
  "customerId": "load-test-customer",
  "items": [
    {"productId": "load-test-product", "quantity": 2, "price": 29.99}
  ]
}
EOF

# Run Apache Bench
# -n 5000: Total requests
# -c 100: Concurrent requests
# -H: Headers
# -p: POST data file
ab -n 5000 -c 100 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTc2MzI0NzQ3OX0.pavEIVCQN3SIIC_rbtq-YRXr7Rmy6atxb_oy7iuOLbw" \
  -H "Idempotency-Key: ab-test-$(date +%s)" \
  -p /tmp/order-data.json \
  http://localhost:3000/api/orders

echo ""
echo "✅ Apache Bench test complete!"
echo "📊 Check the detailed statistics above"

# Cleanup
rm /tmp/order-data.json
