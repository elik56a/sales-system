#!/bin/bash

# Simple Concurrent Load Test - Background jobs
echo "🚀 Starting 5000 concurrent requests..."

start_time=$(date +%s)

# Launch all requests in background
for i in {1..5000}; do
  {
    curl -s -X POST http://localhost:3000/api/orders \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTc2MzI0NzQ3OX0.pavEIVCQN3SIIC_rbtq-YRXr7Rmy6atxb_oy7iuOLbw" \
      -H "Idempotency-Key: simple-test-$i-$(date +%s%N)" \
      -d "{
        \"customerId\": \"customer-$i\",
        \"items\": [
          {\"productId\": \"product-$((i * 100))\", \"quantity\": $((i % 10 + 1)), \"price\": $((i % 50 + 10)).99}
        ]
      }" > /dev/null 2>&1
    echo "✓ $i"
  } &
  
  # Limit concurrent jobs to avoid overwhelming system
  if (( i % 100 == 0 )); then
    wait # Wait for current batch to complete
    echo "Batch $((i/100)) completed..."
  fi
done

# Wait for all remaining jobs
wait

end_time=$(date +%s)
duration=$((end_time - start_time))

echo ""
echo "🎉 All 5000 requests completed in $duration seconds!"
echo "📊 Average: $((5000 / duration)) requests/second"
