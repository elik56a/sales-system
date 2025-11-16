#!/bin/bash

# Concurrent Load Test - 5000 simultaneous requests
echo "🚀 Running CONCURRENT load test - creating 5000 orders simultaneously..."

# Function to create a single order
create_order() {
  local i=$1
  curl -s -X POST http://localhost:3000/api/orders \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTc2MzI0NzQ3OX0.pavEIVCQN3SIIC_rbtq-YRXr7Rmy6atxb_oy7iuOLbw" \
    -H "Idempotency-Key: concurrent-test-$i-$(date +%s%N)" \
    -d "{
      \"customerId\": \"customer-$i\",
      \"items\": [
        {\"productId\": \"product-$((i * 100))\", \"quantity\": $((i % 10 + 1)), \"price\": $((i % 50 + 10)).99}
      ]
    }" > /tmp/order_$i.json 2>&1
  
  echo "Order $i completed"
}

# Export function so it can be used by parallel
export -f create_order

# Start timer
start_time=$(date +%s)

# Create all 5000 orders in parallel using GNU parallel or xargs
if command -v parallel >/dev/null 2>&1; then
  echo "Using GNU parallel for maximum concurrency..."
  seq 1 5000 | parallel -j 100 create_order
else
  echo "Using xargs for concurrency (install 'parallel' for better performance)..."
  seq 1 5000 | xargs -n 1 -P 100 -I {} bash -c 'create_order {}'
fi

# End timer
end_time=$(date +%s)
duration=$((end_time - start_time))

echo ""
echo "✅ Concurrent load test complete!"
echo "📊 Created 5000 orders in $duration seconds"
echo "🔥 Average: $((5000 / duration)) orders/second"
echo ""
echo "📈 Check system performance:"
echo "- Database connections"
echo "- Memory usage"
echo "- Background worker processing"
echo ""
echo "🗂️  Results saved in /tmp/order_*.json"
