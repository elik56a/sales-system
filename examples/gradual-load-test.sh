#!/bin/bash

# Gradual Load Test - Realistic load testing with ramp-up
echo "🚀 Starting gradual load test..."

# Configuration
BASE_URL="http://localhost:3000/api/orders"
JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTc2MzI0NzQ3OX0.pavEIVCQN3SIIC_rbtq-YRXr7Rmy6atxb_oy7iuOLbw"

# Test phases
declare -a PHASES=(
  "10:5:Warm-up"      # 10 requests over 5 seconds
  "50:10:Light Load"  # 50 requests over 10 seconds  
  "100:15:Medium Load" # 100 requests over 15 seconds
  "200:20:Heavy Load"  # 200 requests over 20 seconds
  "500:30:Peak Load"   # 500 requests over 30 seconds
)

# Results tracking
TOTAL_REQUESTS=0
TOTAL_SUCCESS=0
TOTAL_FAILURES=0
START_TIME=$(date +%s)

# Function to create a single order
create_order() {
  local i=$1
  local phase=$2
  
  local response=$(curl -s -w "%{http_code}" -X POST $BASE_URL \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Idempotency-Key: gradual-test-$phase-$i-$(date +%s%N)" \
    -d "{
      \"customerId\": \"customer-$i\",
      \"items\": [
        {\"productId\": \"product-$((i * 10))\", \"quantity\": $((i % 5 + 1)), \"price\": $((i % 30 + 20)).99}
      ]
    }" 2>/dev/null)
  
  local http_code="${response: -3}"
  
  if [[ "$http_code" == "201" ]]; then
    echo "✅ $phase-$i: SUCCESS"
    return 0
  else
    echo "❌ $phase-$i: FAILED ($http_code)"
    return 1
  fi
}

# Export function for parallel execution
export -f create_order
export BASE_URL JWT_TOKEN

# Run each phase
for phase_config in "${PHASES[@]}"; do
  IFS=':' read -r requests duration phase_name <<< "$phase_config"
  
  echo ""
  echo "📊 Phase: $phase_name"
  echo "   Requests: $requests"
  echo "   Duration: ${duration}s"
  echo "   Rate: $((requests / duration)) req/s"
  echo ""
  
  phase_start=$(date +%s)
  
  # Calculate delay between requests for even distribution
  delay_ms=$((duration * 1000 / requests))
  
  # Start requests with controlled timing
  success_count=0
  failure_count=0
  
  for ((i=1; i<=requests; i++)); do
    {
      if create_order $i "$phase_name"; then
        ((success_count++))
      else
        ((failure_count++))
      fi
    } &
    
    # Control the rate
    if [[ $delay_ms -gt 0 ]]; then
      sleep $(echo "scale=3; $delay_ms/1000" | bc -l) 2>/dev/null || sleep 0.1
    fi
  done
  
  # Wait for all requests in this phase to complete
  wait
  
  phase_end=$(date +%s)
  phase_duration=$((phase_end - phase_start))
  
  # Update totals
  TOTAL_REQUESTS=$((TOTAL_REQUESTS + requests))
  TOTAL_SUCCESS=$((TOTAL_SUCCESS + success_count))
  TOTAL_FAILURES=$((TOTAL_FAILURES + failure_count))
  
  # Phase results
  if [[ $requests -gt 0 ]]; then
    success_rate=$((success_count * 100 / requests))
  else
    success_rate=0
  fi
  
  if [[ $phase_duration -gt 0 ]]; then
    actual_rate=$((requests / phase_duration))
  else
    actual_rate=0
  fi
  
  echo ""
  echo "📈 $phase_name Results:"
  echo "   ✅ Success: $success_count/$requests ($success_rate%)"
  echo "   ❌ Failures: $failure_count"
  echo "   ⏱️  Duration: ${phase_duration}s"
  echo "   📊 Rate: $actual_rate req/s"
  
  # Brief pause between phases
  echo "   ⏸️  Cooling down for 5 seconds..."
  sleep 5
done

# Final results
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

if [[ $TOTAL_REQUESTS -gt 0 ]]; then
  OVERALL_SUCCESS_RATE=$((TOTAL_SUCCESS * 100 / TOTAL_REQUESTS))
else
  OVERALL_SUCCESS_RATE=0
fi

if [[ $TOTAL_DURATION -gt 0 ]]; then
  AVERAGE_RATE=$((TOTAL_REQUESTS / TOTAL_DURATION))
else
  AVERAGE_RATE=0
fi

echo ""
echo "🎉 GRADUAL LOAD TEST COMPLETE!"
echo "================================"
echo "📊 Overall Results:"
echo "   Total Requests: $TOTAL_REQUESTS"
echo "   ✅ Successful: $TOTAL_SUCCESS ($OVERALL_SUCCESS_RATE%)"
echo "   ❌ Failed: $TOTAL_FAILURES"
echo "   ⏱️  Total Duration: ${TOTAL_DURATION}s"
echo "   📈 Average Rate: $AVERAGE_RATE req/s"
echo ""

if [[ $OVERALL_SUCCESS_RATE -ge 95 ]]; then
  echo "🏆 EXCELLENT: >95% success rate!"
elif [[ $OVERALL_SUCCESS_RATE -ge 90 ]]; then
  echo "🎯 GOOD: >90% success rate"
elif [[ $OVERALL_SUCCESS_RATE -ge 80 ]]; then
  echo "⚠️  FAIR: >80% success rate - room for improvement"
else
  echo "🚨 POOR: <80% success rate - needs optimization"
fi

echo ""
echo "💡 Next steps:"
echo "   - Check database for actual order count"
echo "   - Monitor system resources during test"
echo "   - Analyze failure patterns in logs"
