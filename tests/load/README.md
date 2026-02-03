# Club Commander - Load Testing

Per IMPLEMENTATION_PHASES.md Phase 6, Step 6.1

## Overview

Load testing suite using k6 to validate Commander performance under various load conditions.

**Target:**
- 100 concurrent venues
- 1000 concurrent users
- Tests: waitlist operations, tournament clock, notifications

## Prerequisites

Install k6:
```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6
```

## Running Tests

### Basic run (default scenarios)
```bash
k6 run tests/load/k6-commander-load-tests.js
```

### With custom configuration
```bash
# Set environment variables
export BASE_URL=http://localhost:3000
export TEST_VENUE_ID=1
export TEST_TOKEN=your-auth-token

k6 run tests/load/k6-commander-load-tests.js
```

### Quick smoke test
```bash
k6 run --vus 10 --duration 30s tests/load/k6-commander-load-tests.js
```

### Full load test
```bash
k6 run --vus 100 --duration 10m tests/load/k6-commander-load-tests.js
```

### Stress test
```bash
k6 run --vus 500 --duration 5m tests/load/k6-commander-load-tests.js
```

## Test Scenarios

The default configuration includes three scenarios:

1. **Steady Load (0-3 min)**
   - 50 virtual users
   - Simulates normal operation

2. **Peak Load (3-8 min)**
   - Ramps from 50 to 200 users
   - Simulates Friday night rush

3. **Spike Test (8-9 min)**
   - Sudden burst to 500 users
   - Tests system resilience

## Test Coverage

| Operation | Weight | Description |
|-----------|--------|-------------|
| Waitlist Join/Leave | 35% | Most common operation |
| Live Games View | 20% | Check running games |
| Tournament Clock | 15% | Real-time clock updates |
| Notifications | 10% | Send/receive notifications |
| Promotions | 8% | Active promotions list |
| Analytics | 7% | Daily analytics fetch |
| AI Predictions | 5% | Wait time predictions |

## Thresholds

Pass/fail criteria:

| Metric | Threshold |
|--------|-----------|
| HTTP p95 latency | < 500ms |
| HTTP p99 latency | < 1000ms |
| HTTP failure rate | < 1% |
| Waitlist join p95 | < 300ms |
| API error rate | < 5% |

## Output

Results are saved to `tests/load/summary.json` and displayed in console.

### Key Metrics to Monitor

1. **http_req_duration** - Overall API latency
2. **waitlist_join_duration** - Critical path latency
3. **api_error_rate** - Error percentage
4. **http_req_failed** - Failed request count

## Troubleshooting

### High Error Rate
- Check database connection pool limits
- Verify rate limiting configuration
- Review Supabase connection limits

### High Latency
- Check database query performance
- Review N+1 query issues
- Consider adding database indexes

### Timeouts
- Increase timeout in k6 options
- Check for long-running database operations
- Review realtime subscription limits

## Integration with CI/CD

Example GitHub Action:
```yaml
- name: Run Load Tests
  run: |
    k6 run --out json=load-results.json tests/load/k6-commander-load-tests.js

- name: Check Results
  run: |
    # Parse results and fail if thresholds not met
    cat load-results.json | jq '.thresholds | to_entries | map(select(.value.ok == false)) | length'
```
