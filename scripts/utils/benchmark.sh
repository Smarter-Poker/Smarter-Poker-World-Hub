#!/bin/bash
# Performance Benchmarking Utility for Smarter.Poker
# Measures build times, page loads, and resource usage

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
BENCHMARK_DIR="$PROJECT_ROOT/benchmarks"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Initialize benchmark directory
mkdir -p "$BENCHMARK_DIR"

# Get timestamp
timestamp() {
    date +%Y%m%d_%H%M%S
}

# Get milliseconds
get_ms() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - use Python for milliseconds
        python3 -c 'import time; print(int(time.time() * 1000))'
    else
        date +%s%3N
    fi
}

# ============================================
# Build Performance
# ============================================

benchmark_build() {
    local build_type="${1:-dev}"
    local output="$BENCHMARK_DIR/build_$(timestamp).json"
    
    echo -e "${YELLOW}🏗️  Benchmarking $build_type build...${NC}"
    
    local start=$(get_ms)
    
    # Run build
    if [ "$build_type" = "prod" ]; then
        npm run build 2>&1 | tee "$BENCHMARK_DIR/build_log_$(timestamp).txt"
        local build_result=$?
    else
        timeout 60 npm run dev &
        local dev_pid=$!
        sleep 10  # Wait for dev server to start
        kill $dev_pid 2>/dev/null || true
        local build_result=0
    fi
    
    local end=$(get_ms)
    local duration=$((end - start))
    
    # Get bundle sizes
    local bundle_size=""
    if [ -d ".next" ]; then
        bundle_size=$(du -sh .next 2>/dev/null | cut -f1)
    fi
    
    # Create benchmark result
    cat > "$output" << EOF
{
  "type": "$build_type",
  "duration_ms": $duration,
  "duration_readable": "$(echo "scale=2; $duration / 1000" | bc)s",
  "success": $([ $build_result -eq 0 ] && echo "true" || echo "false"),
  "bundle_size": "$bundle_size",
  "node_version": "$(node --version)",
  "npm_version": "$(npm --version)",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "machine": {
    "cpu": "$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo 'unknown')",
    "cores": $(sysctl -n hw.ncpu 2>/dev/null || echo 0),
    "memory_gb": $(echo "scale=0; $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1024 / 1024 / 1024" | bc)
  }
}
EOF
    
    echo -e "${GREEN}✓ Build completed in $(echo "scale=2; $duration / 1000" | bc)s${NC}"
    echo -e "${CYAN}  Bundle size: $bundle_size${NC}"
    echo -e "${CYAN}  Results saved to: $output${NC}"
}

# ============================================
# Page Load Performance
# ============================================

benchmark_page() {
    local url="${1:-http://localhost:3000}"
    local iterations="${2:-5}"
    local output="$BENCHMARK_DIR/page_$(timestamp).json"
    
    echo -e "${YELLOW}🌐 Benchmarking page load: $url${NC}"
    echo -e "${CYAN}   Running $iterations iterations...${NC}"
    
    local times=()
    local total=0
    
    for i in $(seq 1 $iterations); do
        # Use curl with timing
        local time=$(curl -o /dev/null -s -w '%{time_total}' "$url" 2>/dev/null)
        local time_ms=$(echo "$time * 1000" | bc | cut -d. -f1)
        times+=($time_ms)
        total=$((total + time_ms))
        echo -e "  Iteration $i: ${time_ms}ms"
    done
    
    local avg=$((total / iterations))
    
    # Find min and max
    local min=${times[0]}
    local max=${times[0]}
    for t in "${times[@]}"; do
        [ "$t" -lt "$min" ] && min=$t
        [ "$t" -gt "$max" ] && max=$t
    done
    
    # Create result
    cat > "$output" << EOF
{
  "url": "$url",
  "iterations": $iterations,
  "times_ms": [$(IFS=,; echo "${times[*]}")],
  "average_ms": $avg,
  "min_ms": $min,
  "max_ms": $max,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    echo -e "${GREEN}✓ Average: ${avg}ms (min: ${min}ms, max: ${max}ms)${NC}"
    echo -e "${CYAN}  Results saved to: $output${NC}"
}

# ============================================
# Bundle Analysis
# ============================================

analyze_bundle() {
    local output="$BENCHMARK_DIR/bundle_$(timestamp).json"
    
    echo -e "${YELLOW}📦 Analyzing bundle...${NC}"
    
    # Check if .next exists
    if [ ! -d ".next" ]; then
        echo -e "${RED}❌ No .next directory found. Run 'npm run build' first.${NC}"
        return 1
    fi
    
    # Get detailed sizes
    echo -e "${CYAN}Bundle breakdown:${NC}"
    
    local total_size=$(du -sh .next 2>/dev/null | cut -f1)
    local static_size=$(du -sh .next/static 2>/dev/null | cut -f1 || echo "0")
    local server_size=$(du -sh .next/server 2>/dev/null | cut -f1 || echo "0")
    
    echo "  Total:   $total_size"
    echo "  Static:  $static_size"
    echo "  Server:  $server_size"
    
    # Count chunks
    local chunk_count=$(find .next/static/chunks -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
    local css_count=$(find .next/static/css -name "*.css" 2>/dev/null | wc -l | tr -d ' ')
    
    echo ""
    echo "  JS chunks: $chunk_count"
    echo "  CSS files: $css_count"
    
    # Find largest files
    echo ""
    echo -e "${CYAN}Largest JS chunks:${NC}"
    find .next/static/chunks -name "*.js" -exec ls -lh {} \; 2>/dev/null | sort -k5 -h -r | head -10 | awk '{print "  " $5 "\t" $NF}'
    
    # Save result
    cat > "$output" << EOF
{
  "total_size": "$total_size",
  "static_size": "$static_size",
  "server_size": "$server_size",
  "js_chunks": $chunk_count,
  "css_files": $css_count,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    echo -e "${GREEN}✓ Analysis saved to: $output${NC}"
}

# ============================================
# Memory Usage
# ============================================

monitor_memory() {
    local process="${1:-node}"
    local duration="${2:-60}"
    local interval="${3:-1}"
    local output="$BENCHMARK_DIR/memory_$(timestamp).csv"
    
    echo -e "${YELLOW}🧠 Monitoring memory for $process (${duration}s)${NC}"
    echo "timestamp,pid,rss_mb,vsz_mb,cpu" > "$output"
    
    local end_time=$(($(date +%s) + duration))
    
    while [ $(date +%s) -lt $end_time ]; do
        ps aux | grep "$process" | grep -v grep | while read line; do
            local pid=$(echo "$line" | awk '{print $2}')
            local cpu=$(echo "$line" | awk '{print $3}')
            local rss=$(echo "$line" | awk '{print $6}')
            local vsz=$(echo "$line" | awk '{print $5}')
            
            local rss_mb=$(echo "scale=2; $rss / 1024" | bc)
            local vsz_mb=$(echo "scale=2; $vsz / 1024" | bc)
            
            echo "$(date +%Y-%m-%dT%H:%M:%S),$pid,$rss_mb,$vsz_mb,$cpu" >> "$output"
        done
        sleep "$interval"
    done
    
    echo -e "${GREEN}✓ Memory log saved to: $output${NC}"
}

# ============================================
# Disk I/O
# ============================================

benchmark_io() {
    local test_file="$BENCHMARK_DIR/.io_test_$(timestamp)"
    local size_mb="${1:-100}"
    local output="$BENCHMARK_DIR/io_$(timestamp).json"
    
    echo -e "${YELLOW}💾 Benchmarking disk I/O (${size_mb}MB test)${NC}"
    
    # Write test
    local write_start=$(get_ms)
    dd if=/dev/zero of="$test_file" bs=1m count=$size_mb conv=sync 2>/dev/null
    local write_end=$(get_ms)
    local write_time=$((write_end - write_start))
    local write_speed=$(echo "scale=2; $size_mb * 1000 / $write_time" | bc)
    
    echo "  Write: ${write_speed}MB/s"
    
    # Clear cache
    sync
    
    # Read test
    local read_start=$(get_ms)
    dd if="$test_file" of=/dev/null bs=1m 2>/dev/null
    local read_end=$(get_ms)
    local read_time=$((read_end - read_start))
    local read_speed=$(echo "scale=2; $size_mb * 1000 / $read_time" | bc)
    
    echo "  Read:  ${read_speed}MB/s"
    
    # Cleanup
    rm -f "$test_file"
    
    # Save result
    cat > "$output" << EOF
{
  "test_size_mb": $size_mb,
  "write_time_ms": $write_time,
  "read_time_ms": $read_time,
  "write_speed_mbs": $write_speed,
  "read_speed_mbs": $read_speed,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    echo -e "${GREEN}✓ I/O benchmark saved to: $output${NC}"
}

# ============================================
# Compare Benchmarks
# ============================================

compare() {
    local type="${1:-build}"
    local count="${2:-5}"
    
    echo -e "${YELLOW}📊 Comparing last $count $type benchmarks${NC}"
    echo ""
    
    ls -t "$BENCHMARK_DIR/${type}_"*.json 2>/dev/null | head -$count | while read file; do
        local timestamp=$(jq -r '.timestamp // "unknown"' "$file")
        case $type in
            build)
                local duration=$(jq -r '.duration_readable // "?"' "$file")
                echo "  $timestamp: $duration"
                ;;
            page)
                local avg=$(jq -r '.average_ms // "?"' "$file")
                echo "  $timestamp: ${avg}ms avg"
                ;;
            *)
                echo "  $file"
                ;;
        esac
    done
}

# ============================================
# Full Benchmark Suite
# ============================================

full_benchmark() {
    local output="$BENCHMARK_DIR/full_$(timestamp).json"
    
    echo -e "${MAGENTA}🚀 Running full benchmark suite${NC}"
    echo ""
    
    # Build benchmark
    benchmark_build prod
    echo ""
    
    # Bundle analysis
    analyze_bundle
    echo ""
    
    # I/O benchmark
    benchmark_io 50
    echo ""
    
    echo -e "${GREEN}✅ Full benchmark complete!${NC}"
    echo -e "${CYAN}   Results in: $BENCHMARK_DIR${NC}"
}

# ============================================
# Main Command Handler
# ============================================

case "${1:-help}" in
    build)
        benchmark_build "${2:-dev}"
        ;;
    page)
        benchmark_page "$2" "$3"
        ;;
    bundle)
        analyze_bundle
        ;;
    memory)
        monitor_memory "$2" "$3" "$4"
        ;;
    io)
        benchmark_io "$2"
        ;;
    compare)
        compare "$2" "$3"
        ;;
    full)
        full_benchmark
        ;;
    help|*)
        echo "Performance Benchmarking Utility"
        echo ""
        echo "Usage:"
        echo "  $0 build [dev|prod]            - Benchmark build time"
        echo "  $0 page <url> [iterations]     - Benchmark page load"
        echo "  $0 bundle                      - Analyze bundle sizes"
        echo "  $0 memory <process> [duration] - Monitor memory usage"
        echo "  $0 io [size_mb]                - Benchmark disk I/O"
        echo "  $0 compare [type] [count]      - Compare recent benchmarks"
        echo "  $0 full                        - Run full benchmark suite"
        echo ""
        echo "Results are saved to: $BENCHMARK_DIR"
        echo ""
        ;;
esac
