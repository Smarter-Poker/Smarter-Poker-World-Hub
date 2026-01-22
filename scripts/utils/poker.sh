#!/bin/bash
# Master CLI Tool for Smarter.Poker Development
# Unified interface for all development utilities

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Version
VERSION="1.0.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Banner
show_banner() {
    echo -e "${MAGENTA}"
    echo "  ╔═══════════════════════════════════════════════════════════╗"
    echo "  ║                                                           ║"
    echo "  ║   🎰  SMARTER.POKER DEVELOPER TOOLKIT  🎰                 ║"
    echo "  ║                                                           ║"
    echo "  ║   Version: $VERSION                                          ║"
    echo "  ║                                                           ║"
    echo "  ╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Quick status overview
quick_status() {
    echo -e "${BOLD}${CYAN}📊 System Status${NC}"
    echo ""
    
    # Git status
    local branch=$(cd "$PROJECT_ROOT" && git branch --show-current 2>/dev/null || echo "N/A")
    local changes=$(cd "$PROJECT_ROOT" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    echo -e "  Git Branch:     ${GREEN}$branch${NC} ($changes uncommitted changes)"
    
    # Node/npm versions
    echo -e "  Node.js:        $(node --version 2>/dev/null || echo 'Not found')"
    echo -e "  npm:            $(npm --version 2>/dev/null || echo 'Not found')"
    
    # Dev server status
    if [ -f "$PROJECT_ROOT/.dev-server.pid" ]; then
        local pid=$(cat "$PROJECT_ROOT/.dev-server.pid")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "  Dev Server:     ${GREEN}Running (PID: $pid)${NC}"
        else
            echo -e "  Dev Server:     ${RED}Stopped${NC}"
        fi
    else
        echo -e "  Dev Server:     ${YELLOW}Not started${NC}"
    fi
    
    # Disk space
    local disk_free=$(df -h "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    echo -e "  Disk Free:      $disk_free"
    
    echo ""
}

# ============================================
# Module Wrappers
# ============================================

# Run visual regression tool
run_visual() {
    "$SCRIPT_DIR/visual-regression.sh" "${@}"
}

# Run image optimizer
run_image() {
    "$SCRIPT_DIR/image-optimizer.sh" "${@}"
}

# Run video processor
run_video() {
    "$SCRIPT_DIR/video-processor.sh" "${@}"
}

# Run notifier
run_notify() {
    "$SCRIPT_DIR/notify.sh" "${@}"
}

# Run data extractor
run_data() {
    "$SCRIPT_DIR/data-extractor.sh" "${@}"
}

# Run benchmark
run_benchmark() {
    "$SCRIPT_DIR/benchmark.sh" "${@}"
}

# Run git helper
run_git() {
    "$SCRIPT_DIR/git-helper.sh" "${@}"
}

# Run dev server
run_dev() {
    "$SCRIPT_DIR/dev-server.sh" "${@}"
}

# ============================================
# Quick Commands
# ============================================

# Start everything
startup() {
    echo -e "${MAGENTA}🚀 Starting development environment...${NC}"
    echo ""
    
    # Sync with git
    run_git sync
    echo ""
    
    # Start dev server
    run_dev start
    echo ""
    
    run_notify success "Development environment ready!"
}

# Stop everything
shutdown() {
    echo -e "${MAGENTA}🛑 Shutting down development environment...${NC}"
    echo ""
    
    run_dev stop
    
    run_notify info "Development environment stopped"
}

# Full build and deploy
deploy() {
    echo -e "${MAGENTA}🚀 Starting deployment...${NC}"
    echo ""
    
    run_notify deploy-start
    
    # Build
    echo -e "${CYAN}Building...${NC}"
    cd "$PROJECT_ROOT"
    
    local start=$(date +%s)
    if npm run build; then
        local end=$(date +%s)
        local duration=$((end - start))
        
        echo -e "${GREEN}✓ Build completed in ${duration}s${NC}"
        
        # Push to git
        run_git push "Deploy: $(date +%Y-%m-%d)"
        
        run_notify deploy-success "https://smarter.poker"
    else
        run_notify deploy-fail "Build failed"
        return 1
    fi
}

# Optimize all assets
optimize_all() {
    echo -e "${MAGENTA}🔧 Optimizing all assets...${NC}"
    echo ""
    
    run_image all
    
    run_notify success "Asset optimization complete"
}

# Run full benchmark suite
benchmark_all() {
    echo -e "${MAGENTA}📊 Running full benchmark suite...${NC}"
    echo ""
    
    run_benchmark full
}

# Health check
health() {
    echo -e "${MAGENTA}🏥 Running health check...${NC}"
    echo ""
    
    local issues=0
    
    # Check node_modules
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        echo -e "  ${RED}✗ node_modules missing${NC}"
        ((issues++))
    else
        echo -e "  ${GREEN}✓ node_modules present${NC}"
    fi
    
    # Check .env
    if [ ! -f "$PROJECT_ROOT/.env.local" ] && [ ! -f "$PROJECT_ROOT/.env" ]; then
        echo -e "  ${YELLOW}⚠ No .env file found${NC}"
    else
        echo -e "  ${GREEN}✓ Environment config present${NC}"
    fi
    
    # Check required tools
    for tool in node npm git; do
        if command -v $tool &> /dev/null; then
            echo -e "  ${GREEN}✓ $tool installed${NC}"
        else
            echo -e "  ${RED}✗ $tool not found${NC}"
            ((issues++))
        fi
    done
    
    # Check optional tools
    for tool in jq ffmpeg convert tesseract terminal-notifier; do
        if command -v $tool &> /dev/null; then
            echo -e "  ${GREEN}✓ $tool available${NC}"
        else
            echo -e "  ${YELLOW}○ $tool not installed (optional)${NC}"
        fi
    done
    
    echo ""
    if [ $issues -eq 0 ]; then
        echo -e "${GREEN}✅ All health checks passed${NC}"
    else
        echo -e "${RED}❌ $issues issue(s) found${NC}"
    fi
}

# Interactive mode
interactive() {
    while true; do
        show_banner
        quick_status
        
        echo -e "${BOLD}${CYAN}Available Commands:${NC}"
        echo ""
        echo "  1) Start dev server    6) Run benchmarks"
        echo "  2) Stop dev server     7) Optimize images"
        echo "  3) View logs           8) Git status"
        echo "  4) Build project       9) Deploy"
        echo "  5) Health check        0) Exit"
        echo ""
        read -p "Select option: " choice
        
        case $choice in
            1) run_dev start ;;
            2) run_dev stop ;;
            3) run_dev follow ;;
            4) cd "$PROJECT_ROOT" && npm run build ;;
            5) health ;;
            6) benchmark_all ;;
            7) optimize_all ;;
            8) run_git status ;;
            9) deploy ;;
            0) echo "Goodbye!"; exit 0 ;;
            *) echo "Invalid option" ;;
        esac
        
        echo ""
        read -p "Press Enter to continue..."
        clear
    done
}

# ============================================
# Main Command Handler
# ============================================

case "${1:-help}" in
    # Quick commands
    status)
        show_banner
        quick_status
        ;;
    startup|up)
        startup
        ;;
    shutdown|down)
        shutdown
        ;;
    deploy)
        deploy
        ;;
    optimize)
        optimize_all
        ;;
    benchmark)
        benchmark_all
        ;;
    health)
        health
        ;;
    interactive|i)
        interactive
        ;;
    
    # Module routing
    visual|vr)
        run_visual "${@:2}"
        ;;
    image|img)
        run_image "${@:2}"
        ;;
    video|vid)
        run_video "${@:2}"
        ;;
    notify|n)
        run_notify "${@:2}"
        ;;
    data)
        run_data "${@:2}"
        ;;
    bench)
        run_benchmark "${@:2}"
        ;;
    git|g)
        run_git "${@:2}"
        ;;
    dev|d)
        run_dev "${@:2}"
        ;;
    
    version|-v|--version)
        echo "Smarter.Poker CLI v$VERSION"
        ;;
    
    help|-h|--help|*)
        show_banner
        echo -e "${BOLD}${CYAN}Quick Commands:${NC}"
        echo "  $0 status              - Show system status"
        echo "  $0 startup|up          - Start dev environment"
        echo "  $0 shutdown|down       - Stop dev environment"
        echo "  $0 deploy              - Build and deploy"
        echo "  $0 optimize            - Optimize all assets"
        echo "  $0 benchmark           - Run benchmarks"
        echo "  $0 health              - Run health check"
        echo "  $0 interactive|i       - Interactive mode"
        echo ""
        echo -e "${BOLD}${CYAN}Module Commands:${NC}"
        echo "  $0 dev <cmd>           - Dev server control"
        echo "  $0 git <cmd>           - Git automation"
        echo "  $0 image <cmd>         - Image optimization"
        echo "  $0 video <cmd>         - Video processing"
        echo "  $0 visual <cmd>        - Visual regression"
        echo "  $0 data <cmd>          - Data extraction"
        echo "  $0 bench <cmd>         - Benchmarking"
        echo "  $0 notify <cmd>        - Notifications"
        echo ""
        echo -e "${BOLD}${CYAN}Examples:${NC}"
        echo "  $0 dev start           - Start dev server"
        echo "  $0 git push            - Commit and push"
        echo "  $0 image cards         - Optimize card images"
        echo "  $0 notify success 'Done!' - Send notification"
        echo ""
        echo "Run '$0 <module> help' for module-specific help"
        echo ""
        ;;
esac
