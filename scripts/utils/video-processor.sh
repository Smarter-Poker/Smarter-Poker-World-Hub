#!/bin/bash
# Video Processing Utility for Smarter.Poker
# Uses ffmpeg for video conversion, optimization, and GIF creation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default settings
VIDEO_QUALITY="23"  # CRF value (lower = better quality, 18-28 recommended)
AUDIO_BITRATE="128k"
GIF_FPS="15"
GIF_WIDTH="480"

# Function to get video info
video_info() {
    local file="$1"
    
    echo -e "${YELLOW}📹 Video Information: $(basename "$file")${NC}"
    ffprobe -v quiet -print_format json -show_format -show_streams "$file" | jq '.'
}

# Function to convert video to optimized MP4
optimize_mp4() {
    local input="$1"
    local output="${2:-${input%.*}_optimized.mp4}"
    
    echo -e "${CYAN}🔧 Optimizing MP4: $(basename "$input")${NC}"
    
    ffmpeg -i "$input" \
        -c:v libx264 \
        -preset medium \
        -crf $VIDEO_QUALITY \
        -c:a aac \
        -b:a $AUDIO_BITRATE \
        -movflags +faststart \
        -y "$output" 2>/dev/null
    
    local original_size=$(stat -f%z "$input" 2>/dev/null || stat -c%s "$input" 2>/dev/null)
    local new_size=$(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null)
    local savings=$((original_size - new_size))
    local percent=$((savings * 100 / original_size))
    
    echo -e "  ${GREEN}✓ Saved $percent% ($((new_size / 1024 / 1024))MB)${NC}"
}

# Function to convert video to WebM
convert_to_webm() {
    local input="$1"
    local output="${2:-${input%.*}.webm}"
    
    echo -e "${CYAN}🔄 Converting to WebM: $(basename "$input")${NC}"
    
    ffmpeg -i "$input" \
        -c:v libvpx-vp9 \
        -crf 30 \
        -b:v 0 \
        -c:a libopus \
        -b:a 128k \
        -y "$output" 2>/dev/null
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Function to convert video to animated GIF
video_to_gif() {
    local input="$1"
    local output="${2:-${input%.*}.gif}"
    local fps="${3:-$GIF_FPS}"
    local width="${4:-$GIF_WIDTH}"
    
    echo -e "${CYAN}🎬 Converting to GIF: $(basename "$input")${NC}"
    
    # Generate palette for better colors
    local palette="/tmp/palette_$$.png"
    
    ffmpeg -i "$input" \
        -vf "fps=$fps,scale=$width:-1:flags=lanczos,palettegen" \
        -y "$palette" 2>/dev/null
    
    ffmpeg -i "$input" -i "$palette" \
        -lavfi "fps=$fps,scale=$width:-1:flags=lanczos [x]; [x][1:v] paletteuse" \
        -y "$output" 2>/dev/null
    
    rm -f "$palette"
    
    # Optimize with gifsicle if available
    if command -v gifsicle &> /dev/null; then
        gifsicle -O3 "$output" -o "$output"
    fi
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Function to extract thumbnail from video
extract_thumbnail() {
    local input="$1"
    local output="${2:-${input%.*}_thumb.jpg}"
    local timestamp="${3:-00:00:01}"
    
    echo -e "${CYAN}🖼️ Extracting thumbnail: $(basename "$input")${NC}"
    
    ffmpeg -i "$input" \
        -ss "$timestamp" \
        -vframes 1 \
        -q:v 2 \
        -y "$output" 2>/dev/null
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Function to extract audio from video
extract_audio() {
    local input="$1"
    local output="${2:-${input%.*}.mp3}"
    
    echo -e "${CYAN}🎵 Extracting audio: $(basename "$input")${NC}"
    
    ffmpeg -i "$input" \
        -vn \
        -acodec libmp3lame \
        -ab 192k \
        -y "$output" 2>/dev/null
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Function to trim video
trim_video() {
    local input="$1"
    local start="$2"
    local duration="$3"
    local output="${4:-${input%.*}_trimmed.mp4}"
    
    echo -e "${CYAN}✂️ Trimming video: $(basename "$input")${NC}"
    
    ffmpeg -i "$input" \
        -ss "$start" \
        -t "$duration" \
        -c copy \
        -y "$output" 2>/dev/null
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Function to add watermark
add_watermark() {
    local video="$1"
    local watermark="$2"
    local output="${3:-${video%.*}_watermarked.mp4}"
    local position="${4:-bottomright}"
    
    echo -e "${CYAN}🏷️ Adding watermark: $(basename "$video")${NC}"
    
    case $position in
        topleft)
            overlay="10:10"
            ;;
        topright)
            overlay="main_w-overlay_w-10:10"
            ;;
        bottomleft)
            overlay="10:main_h-overlay_h-10"
            ;;
        bottomright|*)
            overlay="main_w-overlay_w-10:main_h-overlay_h-10"
            ;;
    esac
    
    ffmpeg -i "$video" -i "$watermark" \
        -filter_complex "overlay=$overlay" \
        -y "$output" 2>/dev/null
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Function to concatenate videos
concat_videos() {
    local output="$1"
    shift
    local inputs=("$@")
    
    echo -e "${CYAN}🔗 Concatenating videos${NC}"
    
    # Create concat file
    local concat_file="/tmp/concat_$$.txt"
    for video in "${inputs[@]}"; do
        echo "file '$video'" >> "$concat_file"
    done
    
    ffmpeg -f concat -safe 0 -i "$concat_file" \
        -c copy \
        -y "$output" 2>/dev/null
    
    rm -f "$concat_file"
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Function to create video from images (slideshow)
images_to_video() {
    local pattern="$1"
    local output="${2:-slideshow.mp4}"
    local fps="${3:-1}"
    
    echo -e "${CYAN}🎞️ Creating slideshow from images${NC}"
    
    ffmpeg -framerate "$fps" -pattern_type glob -i "$pattern" \
        -c:v libx264 \
        -pix_fmt yuv420p \
        -y "$output" 2>/dev/null
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Function to add audio to video
add_audio() {
    local video="$1"
    local audio="$2"
    local output="${3:-${video%.*}_with_audio.mp4}"
    
    echo -e "${CYAN}🔊 Adding audio to video${NC}"
    
    ffmpeg -i "$video" -i "$audio" \
        -c:v copy \
        -c:a aac \
        -shortest \
        -y "$output" 2>/dev/null
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Function to scale video
scale_video() {
    local input="$1"
    local width="$2"
    local height="${3:--1}"
    local output="${4:-${input%.*}_${width}p.mp4}"
    
    echo -e "${CYAN}📐 Scaling video to ${width}x${height}${NC}"
    
    ffmpeg -i "$input" \
        -vf "scale=$width:$height" \
        -c:a copy \
        -y "$output" 2>/dev/null
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Function to create video preview (loop of first few seconds)
create_preview() {
    local input="$1"
    local duration="${2:-3}"
    local output="${3:-${input%.*}_preview.mp4}"
    
    echo -e "${CYAN}🔁 Creating preview loop${NC}"
    
    # Extract clip and loop it 3 times
    ffmpeg -i "$input" \
        -ss 0 -t "$duration" \
        -filter_complex "[0:v]loop=3:size=900:start=0[looped]" \
        -map "[looped]" \
        -an \
        -y "$output" 2>/dev/null
    
    echo -e "  ${GREEN}✓ Created $(basename "$output")${NC}"
}

# Main command handler
case "${1:-help}" in
    info)
        video_info "$2"
        ;;
    optimize)
        optimize_mp4 "$2" "$3"
        ;;
    webm)
        convert_to_webm "$2" "$3"
        ;;
    gif)
        video_to_gif "$2" "$3" "$4" "$5"
        ;;
    thumb|thumbnail)
        extract_thumbnail "$2" "$3" "$4"
        ;;
    audio)
        extract_audio "$2" "$3"
        ;;
    trim)
        trim_video "$2" "$3" "$4" "$5"
        ;;
    watermark)
        add_watermark "$2" "$3" "$4" "$5"
        ;;
    concat)
        concat_videos "${@:2}"
        ;;
    slideshow)
        images_to_video "$2" "$3" "$4"
        ;;
    add-audio)
        add_audio "$2" "$3" "$4"
        ;;
    scale)
        scale_video "$2" "$3" "$4" "$5"
        ;;
    preview)
        create_preview "$2" "$3" "$4"
        ;;
    help|*)
        echo "Video Processing Utility for Smarter.Poker"
        echo ""
        echo "Usage:"
        echo "  $0 info <file>                         - Show video information"
        echo "  $0 optimize <input> [output]           - Optimize MP4 for web"
        echo "  $0 webm <input> [output]               - Convert to WebM"
        echo "  $0 gif <input> [output] [fps] [width]  - Convert to animated GIF"
        echo "  $0 thumb <input> [output] [timestamp]  - Extract thumbnail"
        echo "  $0 audio <input> [output]              - Extract audio as MP3"
        echo "  $0 trim <input> <start> <duration>     - Trim video"
        echo "  $0 watermark <video> <image> [output]  - Add watermark"
        echo "  $0 concat <output> <video1> <video2>   - Concatenate videos"
        echo "  $0 slideshow <pattern> [output] [fps]  - Create slideshow from images"
        echo "  $0 add-audio <video> <audio> [output]  - Add audio track to video"
        echo "  $0 scale <input> <width> [height]      - Scale video"
        echo "  $0 preview <input> [duration] [output] - Create looping preview"
        echo ""
        ;;
esac
