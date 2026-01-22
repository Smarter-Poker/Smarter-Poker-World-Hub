#!/bin/bash
# Screenshot & Recording Utility for Smarter.Poker
# Capture screenshots, record screen, and create demo content

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
CAPTURES_DIR="$PROJECT_ROOT/screenshots"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$CAPTURES_DIR"

# Get timestamp for filenames
timestamp() {
    date +%Y%m%d_%H%M%S
}

# ============================================
# Screenshots
# ============================================

# Capture full screen
screenshot_full() {
    local output="${1:-$CAPTURES_DIR/fullscreen_$(timestamp).png}"
    
    echo -e "${CYAN}📸 Capturing full screen...${NC}"
    
    screencapture -x "$output"
    
    echo -e "${GREEN}✓ Saved to $output${NC}"
    echo "$output"
}

# Capture window (interactive)
screenshot_window() {
    local output="${1:-$CAPTURES_DIR/window_$(timestamp).png}"
    
    echo -e "${CYAN}📸 Click on a window to capture...${NC}"
    
    screencapture -W -x "$output"
    
    echo -e "${GREEN}✓ Saved to $output${NC}"
    echo "$output"
}

# Capture selection (interactive)
screenshot_selection() {
    local output="${1:-$CAPTURES_DIR/selection_$(timestamp).png}"
    
    echo -e "${CYAN}📸 Select an area to capture...${NC}"
    
    screencapture -s -x "$output"
    
    echo -e "${GREEN}✓ Saved to $output${NC}"
    echo "$output"
}

# Capture specific window by app name
screenshot_app() {
    local app="$1"
    local output="${2:-$CAPTURES_DIR/${app// /_}_$(timestamp).png}"
    
    if [ -z "$app" ]; then
        echo -e "${RED}❌ App name required${NC}"
        return 1
    fi
    
    echo -e "${CYAN}📸 Capturing $app window...${NC}"
    
    # Get window ID using AppleScript
    local window_id=$(osascript -e "tell application \"$app\" to id of window 1" 2>/dev/null)
    
    if [ -n "$window_id" ]; then
        screencapture -l"$window_id" -x "$output"
        echo -e "${GREEN}✓ Saved to $output${NC}"
    else
        echo -e "${YELLOW}⚠️  Couldn't find $app window, using interactive mode${NC}"
        screencapture -W -x "$output"
    fi
    
    echo "$output"
}

# Capture Safari/Chrome browser
screenshot_browser() {
    local browser="${1:-Safari}"
    local output="${2:-$CAPTURES_DIR/browser_$(timestamp).png}"
    
    screenshot_app "$browser" "$output"
}

# Capture localhost page
screenshot_localhost() {
    local port="${1:-3000}"
    local path="${2:-}"
    local output="${3:-$CAPTURES_DIR/localhost_$(timestamp).png}"
    
    echo -e "${CYAN}📸 Capturing localhost:$port$path...${NC}"
    
    # Open URL and wait for it to load
    osascript <<EOF
tell application "Safari"
    activate
    open location "http://localhost:$port$path"
    delay 3
end tell
EOF
    
    # Capture Safari
    screenshot_app "Safari" "$output"
}

# ============================================
# Screen Recording  
# ============================================

# Start recording (full screen)
record_start() {
    local output="${1:-$CAPTURES_DIR/recording_$(timestamp).mov}"
    
    echo -e "${CYAN}🎬 Starting screen recording...${NC}"
    echo -e "${YELLOW}   Press Ctrl+C to stop${NC}"
    
    # Store output path for stop command
    echo "$output" > "$CAPTURES_DIR/.recording_path"
    
    # Start recording using screencapture
    screencapture -v -G 1 "$output" &
    local pid=$!
    echo $pid > "$CAPTURES_DIR/.recording_pid"
    
    echo -e "${GREEN}✓ Recording started (PID: $pid)${NC}"
    echo "  Output: $output"
}

# Stop recording
record_stop() {
    if [ -f "$CAPTURES_DIR/.recording_pid" ]; then
        local pid=$(cat "$CAPTURES_DIR/.recording_pid")
        
        echo -e "${CYAN}🎬 Stopping recording...${NC}"
        
        kill -INT "$pid" 2>/dev/null || true
        
        rm -f "$CAPTURES_DIR/.recording_pid"
        
        if [ -f "$CAPTURES_DIR/.recording_path" ]; then
            local output=$(cat "$CAPTURES_DIR/.recording_path")
            rm -f "$CAPTURES_DIR/.recording_path"
            
            sleep 2
            
            if [ -f "$output" ]; then
                echo -e "${GREEN}✓ Recording saved to $output${NC}"
                
                # Convert to MP4 if ffmpeg available
                if command -v ffmpeg &> /dev/null; then
                    local mp4_output="${output%.mov}.mp4"
                    echo -e "${CYAN}  Converting to MP4...${NC}"
                    ffmpeg -i "$output" -vcodec h264 -acodec aac "$mp4_output" -y 2>/dev/null
                    echo -e "${GREEN}  ✓ Also saved as $mp4_output${NC}"
                fi
            fi
        fi
    else
        echo -e "${YELLOW}⚠️  No recording in progress${NC}"
    fi
}

# Quick record (record for N seconds)
record_quick() {
    local duration="${1:-10}"
    local output="${2:-$CAPTURES_DIR/quick_recording_$(timestamp).mov}"
    
    echo -e "${CYAN}🎬 Recording for $duration seconds...${NC}"
    
    screencapture -v -V "$duration" "$output"
    
    echo -e "${GREEN}✓ Recording saved to $output${NC}"
}

# ============================================
# GIF Creation
# ============================================

# Convert recording to GIF
recording_to_gif() {
    local input="$1"
    local output="${2:-${input%.*}.gif}"
    local fps="${3:-10}"
    local width="${4:-800}"
    
    if [ ! -f "$input" ]; then
        echo -e "${RED}❌ Input file not found: $input${NC}"
        return 1
    fi
    
    echo -e "${CYAN}🎬 Converting to GIF...${NC}"
    
    # Use ffmpeg for high-quality GIF
    if command -v ffmpeg &> /dev/null; then
        # Generate palette
        local palette="/tmp/palette_$$.png"
        ffmpeg -i "$input" -vf "fps=$fps,scale=$width:-1:flags=lanczos,palettegen" -y "$palette" 2>/dev/null
        
        # Create GIF
        ffmpeg -i "$input" -i "$palette" -lavfi "fps=$fps,scale=$width:-1:flags=lanczos [x]; [x][1:v] paletteuse" -y "$output" 2>/dev/null
        
        rm -f "$palette"
        
        # Optimize with gifsicle if available
        if command -v gifsicle &> /dev/null; then
            gifsicle -O3 "$output" -o "$output"
        fi
        
        echo -e "${GREEN}✓ GIF saved to $output${NC}"
    else
        echo -e "${RED}❌ ffmpeg required for GIF conversion${NC}"
        return 1
    fi
}

# ============================================
# Batch & Automated Captures
# ============================================

# Capture multiple pages
screenshot_pages() {
    local base_url="${1:-http://localhost:3000}"
    shift
    local paths=("$@")
    
    echo -e "${CYAN}📸 Capturing multiple pages from $base_url${NC}"
    
    for path in "${paths[@]}"; do
        local safe_path=$(echo "$path" | tr '/' '_')
        local output="$CAPTURES_DIR/page_${safe_path}_$(timestamp).png"
        
        echo "  Capturing: $path"
        
        osascript <<EOF
tell application "Safari"
    activate
    open location "$base_url$path"
    delay 3
end tell
EOF
        
        screenshot_app "Safari" "$output"
    done
    
    echo -e "${GREEN}✓ Captured ${#paths[@]} pages${NC}"
}

# Time-lapse screenshots
timelapse() {
    local interval="${1:-60}"
    local count="${2:-10}"
    local prefix="${3:-timelapse}"
    
    echo -e "${CYAN}⏱️  Creating timelapse: $count shots, ${interval}s interval${NC}"
    
    for i in $(seq 1 $count); do
        local output="$CAPTURES_DIR/${prefix}_$(printf '%03d' $i).png"
        screencapture -x "$output"
        echo "  Captured $i/$count"
        
        if [ $i -lt $count ]; then
            sleep "$interval"
        fi
    done
    
    echo -e "${GREEN}✓ Timelapse complete${NC}"
    
    # Create GIF from timelapse
    if command -v convert &> /dev/null; then
        local gif_output="$CAPTURES_DIR/${prefix}_$(timestamp).gif"
        convert -delay 100 "$CAPTURES_DIR/${prefix}_"*.png "$gif_output"
        echo -e "${GREEN}✓ Created GIF: $gif_output${NC}"
    fi
}

# ============================================
# Utilities
# ============================================

# List recent captures
list_captures() {
    local count="${1:-10}"
    
    echo -e "${CYAN}📂 Recent captures:${NC}"
    echo ""
    
    ls -lt "$CAPTURES_DIR" | head -$((count + 1)) | tail -n $count
}

# Open captures folder
open_captures() {
    open "$CAPTURES_DIR"
}

# Clean old captures
clean_captures() {
    local days="${1:-7}"
    
    echo -e "${YELLOW}🧹 Cleaning captures older than $days days...${NC}"
    
    local count=$(find "$CAPTURES_DIR" -type f -mtime +"$days" | wc -l | tr -d ' ')
    
    if [ "$count" -gt 0 ]; then
        find "$CAPTURES_DIR" -type f -mtime +"$days" -delete
        echo -e "${GREEN}✓ Deleted $count old captures${NC}"
    else
        echo -e "${CYAN}No old captures to clean${NC}"
    fi
}

# ============================================
# Main Command Handler
# ============================================

case "${1:-help}" in
    # Screenshots
    full)
        screenshot_full "$2"
        ;;
    window)
        screenshot_window "$2"
        ;;
    selection|select)
        screenshot_selection "$2"
        ;;
    app)
        screenshot_app "$2" "$3"
        ;;
    browser)
        screenshot_browser "$2" "$3"
        ;;
    localhost|local)
        screenshot_localhost "$2" "$3" "$4"
        ;;
    
    # Recording
    record)
        record_start "$2"
        ;;
    stop)
        record_stop
        ;;
    quick)
        record_quick "$2" "$3"
        ;;
    
    # GIF
    gif)
        recording_to_gif "$2" "$3" "$4" "$5"
        ;;
    
    # Batch
    pages)
        screenshot_pages "${@:2}"
        ;;
    timelapse)
        timelapse "$2" "$3" "$4"
        ;;
    
    # Utilities
    list|ls)
        list_captures "$2"
        ;;
    open)
        open_captures
        ;;
    clean)
        clean_captures "$2"
        ;;
    
    help|*)
        echo "Screenshot & Recording Utility for Smarter.Poker"
        echo ""
        echo "Screenshots:"
        echo "  $0 full [output]              - Full screen"
        echo "  $0 window [output]            - Click to select window"
        echo "  $0 selection [output]         - Select area"
        echo "  $0 app <name> [output]        - Capture app window"
        echo "  $0 browser [app] [output]     - Capture browser"
        echo "  $0 localhost [port] [path]    - Capture localhost page"
        echo ""
        echo "Recording:"
        echo "  $0 record [output]            - Start recording"
        echo "  $0 stop                       - Stop recording"
        echo "  $0 quick [duration] [output]  - Quick recording"
        echo ""
        echo "GIF:"
        echo "  $0 gif <input> [output]       - Convert to GIF"
        echo ""
        echo "Batch:"
        echo "  $0 pages <url> <path1> ...    - Capture multiple pages"
        echo "  $0 timelapse [int] [count]    - Time-lapse captures"
        echo ""
        echo "Utilities:"
        echo "  $0 list|ls [count]            - List recent captures"
        echo "  $0 open                       - Open captures folder"
        echo "  $0 clean [days]               - Clean old captures"
        echo ""
        echo "Output directory: $CAPTURES_DIR"
        echo ""
        ;;
esac
