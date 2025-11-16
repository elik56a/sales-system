#!/bin/bash

# Peak Ordering Hours Load Test - Simulates high traffic during busy periods
echo "🚀 Simulating peak ordering hours with 5000 requests..."

start_time=$(date +%s)
total_requests=5000
batch_size=500  # Process 500 requests at a time
concurrent_limit=500  # Max 500 concurrent requests

# Create temporary directory for result files
temp_dir=$(mktemp -d)
results_dir="$temp_dir/results"
mkdir -p "$results_dir"

# Function to make a single request
make_request() {
  local i=$1
  local response=$(curl -s -w "%{http_code}" -X POST http://localhost:3000/api/orders \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTc2MzI0NzQ3OX0.pavEIVCQN3SIIC_rbtq-YRXr7Rmy6atxb_oy7iuOLbw" \
    -H "Idempotency-Key: load-test-$i-$(date +%s%N)" \
    -d "{
      \"customerId\": \"customer-$i\",
      \"items\": [
        {\"productId\": \"product-$((i * 100))\", \"quantity\": $((i % 10 + 1)), \"price\": $((i % 50 + 10)).99}
      ]
    }")
  
  local http_code="${response: -3}"
  if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    echo "✓ $i (${http_code})"
    # Create success marker file
    touch "$results_dir/success_$i"
    return 0
  else
    echo "✗ $i (${http_code})"
    # Create error marker file
    touch "$results_dir/error_$i"
    return 1
  fi
}

# Process requests in batches
for ((batch_start=1; batch_start<=total_requests; batch_start+=batch_size)); do
  batch_end=$((batch_start + batch_size - 1))
  if [ $batch_end -gt $total_requests ]; then
    batch_end=$total_requests
  fi
  
  echo "Processing batch: $batch_start-$batch_end"
  
  # Launch batch requests in background
  for ((i=batch_start; i<=batch_end; i++)); do
    {
      make_request $i
    } &
    
    # Limit concurrent processes
    if (( (i - batch_start + 1) % concurrent_limit == 0 )); then
      wait # Wait for current concurrent batch
    fi
  done
  
  # Wait for remaining requests in this batch
  wait
  
  # Progress update - count result files
  completed=$((batch_end))
  current_success=$(ls "$results_dir"/success_* 2>/dev/null | wc -l)
  current_errors=$(ls "$results_dir"/error_* 2>/dev/null | wc -l)
  echo "Progress: $completed/$total_requests completed (Success: $current_success, Errors: $current_errors)"
  
  # Small delay between batches to avoid overwhelming
  sleep 0.1
done

end_time=$(date +%s)
duration=$((end_time - start_time))

# Count final results from marker files
final_success=$(ls "$results_dir"/success_* 2>/dev/null | wc -l)
final_errors=$(ls "$results_dir"/error_* 2>/dev/null | wc -l)

# Clean up temporary directory
rm -rf "$temp_dir"

echo ""
echo "🎉 Load test completed!"
echo "📊 Results:"
echo "   Total Requests: $total_requests"
echo "   Successful: $final_success"
echo "   Failed: $final_errors"
echo "   Duration: ${duration}s"
echo "   Success Rate: $(( final_success * 100 / total_requests ))%"
echo "   Average: $(( total_requests / duration )) requests/second"
