#!/bin/bash
# Development Server Watcher for Smarter.Poker
# Auto-restart, live monitoring, and development helpers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# PID file for tracking server
PID_FILE="$PROJECT_ROOT/.dev-server.pid"
LOG_FILE="$PROJECT_ROOT/.dev-server.log"

# ============================================
# Server Control
# ============================================

# Start development server
start() {
    local port="${1:-3000}"
    
    if is_running; then
        echo -e "${YELLOW}⚠️  Dev server already running (PID: $(cat $PID_FILE))${NC}"
        return 0
    fi
    
    echo -e "${GREEN}🚀 Starting dev server on port $port...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Start server in background
    npm run dev > "$LOG_FILE" 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"
    
    echo -e "${GREEN}✓ Server started (PID: $pid)${NC}"
    echo -e "${CYAN}  Log file: $LOG_FILE${NC}"
    echo -e "${CYAN}  URL: http://localhost:$port${NC}"
    
    # Wait a bit and check if it's still running
    sleep 3
    if is_running; then
        # Notify
        "$SCRIPT_DIR/notify.sh" success "Dev server started on port $port"
        
        # Open in browser
        open "http://localhost:$port"
    else
        echo -e "${RED}❌ Server failed to start. Check logs:${NC}"
        tail -20 "$LOG_FILE"
    fi
}

# Stop development server
stop() {
    if ! is_running; then
        echo -e "${YELLOW}⚠️  Dev server not running${NC}"
        return 0
    fi
    
    local pid=$(cat "$PID_FILE")
    echo -e "${YELLOW}🛑 Stopping dev server (PID: $pid)...${NC}"
    
    kill "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    
    # Also kill any orphaned Next.js processes
    pkill -f "next dev" 2>/dev/null || true
    
    echo -e "${GREEN}✓ Server stopped${NC}"
}

# Restart server
restart() {
    stop
    sleep 2
    start "$1"
}

# Check if server is running
is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
        fi
    fi
    return 1
}

# Server status
status() {
    if is_running; then
        local pid=$(cat "$PID_FILE")
        echo -e "${GREEN}✓ Dev server is running (PID: $pid)${NC}"
        
        # Get memory usage
        local mem=$(ps -o rss= -p "$pid" 2>/dev/null | awk '{print $1/1024 " MB"}')
        echo -e "  Memory: $mem"
        
        # Get uptime
        local start_time=$(ps -o lstart= -p "$pid" 2>/dev/null)
        echo -e "  Started: $start_time"
    else
        echo -e "${RED}✗ Dev server is not running${NC}"
    fi
}

# ============================================
# Monitoring
# ============================================

# Tail logs
logs() {
    local lines="${1:-50}"
    
    echo -e "${CYAN}📜 Dev server logs (last $lines lines)${NC}"
    echo ""
    
    if [ -f "$LOG_FILE" ]; then
        tail -$lines "$LOG_FILE"
    else
        echo "No log file found"
    fi
}

# Follow logs (like tail -f)
follow() {
    echo -e "${CYAN}📜 Following dev server logs (Ctrl+C to stop)${NC}"
    echo ""
    
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo "No log file found"
    fi
}

# Watch for errors in logs
watch_errors() {
    echo -e "${CYAN}🔍 Watching for errors (Ctrl+C to stop)${NC}"
    echo ""
    
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE" | grep --line-buffered -iE "(error|warn|fail)" --color=always
    else
        echo "No log file found"
    fi
}

# ============================================
# File Watchers
# ============================================

# Watch and run command on file change
watch_run() {
    local pattern="${1:-*}"
    local command="${2:-echo 'File changed'}"
    
    echo -e "${CYAN}👁️ Watching for changes in: $pattern${NC}"
    echo -e "${CYAN}   Running: $command${NC}"
    echo ""
    
    if command -v entr &> /dev/null; then
        find . -name "$pattern" -not -path './node_modules/*' -not -path './.next/*' | entr -c $command
    elif command -v watchman &> /dev/null; then
        watchman-make -p "$pattern" --run "$command"
    else
        echo -e "${RED}❌ Neither entr nor watchman is installed${NC}"
        return 1
    fi
}

# Watch and rebuild on changes
watch_build() {
    echo -e "${CYAN}🏗️ Watching for changes and rebuilding...${NC}"
    
    watch_run "*.js *.jsx *.ts *.tsx" "npm run build"
}

# Watch and run tests on changes
watch_test() {
    echo -e "${CYAN}🧪 Watching for changes and testing...${NC}"
    
    watch_run "*.test.js *.spec.js *.test.ts *.spec.ts" "npm test"
}

# ============================================
# Development Helpers
# ============================================

# Open in browser
open_browser() {
    local port="${1:-3000}"
    local path="${2:-}"
    
    open "http://localhost:$port/$path"
}

# Clear Next.js cache
clear_cache() {
    echo -e "${YELLOW}🧹 Clearing Next.js cache...${NC}"
    
    rm -rf "$PROJECT_ROOT/.next"
    rm -rf "$PROJECT_ROOT/node_modules/.cache"
    
    echo -e "${GREEN}✓ Cache cleared${NC}"
}

# Full reset (stop, clear, reinstall, start)
full_reset() {
    echo -e "${MAGENTA}🔄 Full development reset${NC}"
    echo ""
    
    stop
    
    echo -e "${CYAN}Clearing cache...${NC}"
    clear_cache
    
    echo -e "${CYAN}Removing node_modules...${NC}"
    rm -rf "$PROJECT_ROOT/node_modules"
    
    echo -e "${CYAN}Installing dependencies...${NC}"
    cd "$PROJECT_ROOT"
    npm install
    
    echo -e "${CYAN}Starting server...${NC}"
    start
    
    echo -e "${GREEN}✅ Full reset complete${NC}"
}

# ============================================
# Port Management
# ============================================

# Kill process on port
kill_port() {
    local port="${1:-3000}"
    
    echo -e "${YELLOW}🔪 Killing process on port $port...${NC}"
    
    local pid=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ -n "$pid" ]; then
        kill -9 $pid
        echo -e "${GREEN}✓ Killed PID $pid${NC}"
    else
        echo -e "${CYAN}No process found on port $port${NC}"
    fi
}

# List ports in use
list_ports() {
    echo -e "${CYAN}📊 Ports in use${NC}"
    echo ""
    
    lsof -iTCP -sTCP:LISTEN -n | head -20
}

# ============================================
# Quick Actions
# ============================================

# Quick dev session (start server, open browser, follow logs)
dev() {
    start "$1"
    sleep 2
    follow
}

# Production build and serve
prod() {
    echo -e "${CYAN}🏭 Building for production...${NC}"
    
    cd "$PROJECT_ROOT"
    npm run build
    
    echo ""
    echo -e "${CYAN}🚀 Starting production server...${NC}"
    npm run start
}

# ============================================
# Main Command Handler
# ============================================

case "${1:-help}" in
    # Server Control
    start)
        start "$2"
        ;;
    stop)
        stop
        ;;
    restart)
        restart "$2"
        ;;
    status)
        status
        ;;
    
    # Monitoring
    logs)
        logs "$2"
        ;;
    follow|f)
        follow
        ;;
    errors)
        watch_errors
        ;;
    
    # Watchers
    watch)
        watch_run "$2" "$3"
        ;;
    watch-build)
        watch_build
        ;;
    watch-test)
        watch_test
        ;;
    
    # Helpers
    open|o)
        open_browser "$2" "$3"
        ;;
    clear)
        clear_cache
        ;;
    reset)
        full_reset
        ;;
    
    # Port Management
    kill-port)
        kill_port "$2"
        ;;
    ports)
        list_ports
        ;;
    
    # Quick Actions
    dev|d)
        dev "$2"
        ;;
    prod|p)
        prod
        ;;
    
    help|*)
        echo "Development Server Watcher for Smarter.Poker"
        echo ""
        echo "Server Control:"
        echo "  $0 start [port]      - Start dev server"
        echo "  $0 stop              - Stop dev server"
        echo "  $0 restart [port]    - Restart dev server"
        echo "  $0 status            - Check server status"
        echo ""
        echo "Monitoring:"
        echo "  $0 logs [lines]      - Show recent logs"
        echo "  $0 follow|f          - Follow logs in real-time"
        echo "  $0 errors            - Watch for errors only"
        echo ""
        echo "File Watchers:"
        echo "  $0 watch <pat> <cmd> - Run command on file change"
        echo "  $0 watch-build       - Rebuild on changes"
        echo "  $0 watch-test        - Run tests on changes"
        echo ""
        echo "Helpers:"
        echo "  $0 open|o [port]     - Open in browser"
        echo "  $0 clear             - Clear Next.js cache"
        echo "  $0 reset             - Full reset (reinstall)"
        echo ""
        echo "Port Management:"
        echo "  $0 kill-port [port]  - Kill process on port"
        echo "  $0 ports             - List ports in use"
        echo ""
        echo "Quick Actions:"
        echo "  $0 dev|d [port]      - Start and follow logs"
        echo "  $0 prod|p            - Production build & serve"
        echo ""
        ;;
esac
