#!/bin/bash
# Notification Helper for Smarter.Poker Development
# Uses macOS native notifications and sounds

set -e

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Sound effects
SUCCESS_SOUND="/System/Library/Sounds/Glass.aiff"
ERROR_SOUND="/System/Library/Sounds/Basso.aiff"
WARNING_SOUND="/System/Library/Sounds/Sosumi.aiff"
INFO_SOUND="/System/Library/Sounds/Pop.aiff"

# Smarter.Poker branding
APP_NAME="Smarter.Poker"
APP_ICON="/Users/smarter.poker/Documents/hub-vanguard/public/logo.png"

# Function to send macOS notification
notify() {
    local title="$1"
    local message="$2"
    local sound="${3:-default}"
    local subtitle="$4"
    
    # Use terminal-notifier if available (more features)
    if command -v terminal-notifier &> /dev/null; then
        local args=(-title "$title" -message "$message" -appIcon "$APP_ICON")
        [ -n "$subtitle" ] && args+=(-subtitle "$subtitle")
        [ "$sound" != "none" ] && args+=(-sound "$sound")
        terminal-notifier "${args[@]}"
    else
        # Fallback to osascript
        osascript -e "display notification \"$message\" with title \"$title\" ${subtitle:+subtitle \"$subtitle\"}"
    fi
}

# Function to play sound
play_sound() {
    local sound_file="$1"
    if [ -f "$sound_file" ]; then
        afplay "$sound_file" &
    fi
}

# Function to speak text
speak() {
    local text="$1"
    local voice="${2:-Samantha}"
    say -v "$voice" "$text" &
}

# Notification types
notify_success() {
    local message="$1"
    echo -e "${GREEN}✅ SUCCESS: $message${NC}"
    notify "$APP_NAME" "$message" "Glass" "Success"
    play_sound "$SUCCESS_SOUND"
}

notify_error() {
    local message="$1"
    echo -e "${RED}❌ ERROR: $message${NC}"
    notify "$APP_NAME" "$message" "Basso" "Error"
    play_sound "$ERROR_SOUND"
}

notify_warning() {
    local message="$1"
    echo -e "${YELLOW}⚠️  WARNING: $message${NC}"
    notify "$APP_NAME" "$message" "Sosumi" "Warning"
    play_sound "$WARNING_SOUND"
}

notify_info() {
    local message="$1"
    echo -e "${CYAN}ℹ️  INFO: $message${NC}"
    notify "$APP_NAME" "$message" "Pop" "Info"
    play_sound "$INFO_SOUND"
}

# Build-specific notifications
notify_build_started() {
    notify_info "Build started... ⏳"
}

notify_build_success() {
    local duration="${1:-}"
    if [ -n "$duration" ]; then
        notify_success "Build completed in ${duration}s! 🚀"
    else
        notify_success "Build completed successfully! 🚀"
    fi
}

notify_build_failed() {
    local error="${1:-Unknown error}"
    notify_error "Build failed: $error 💥"
}

# Deployment notifications
notify_deploy_started() {
    notify_info "Deploying to production... 🚀"
}

notify_deploy_success() {
    local url="${1:-https://smarter.poker}"
    notify_success "Deployed to $url! 🎉"
    speak "Deployment complete"
}

notify_deploy_failed() {
    local error="${1:-Unknown error}"
    notify_error "Deployment failed: $error 💥"
    speak "Deployment failed"
}

# Test notifications
notify_tests_passed() {
    local count="${1:-all}"
    notify_success "$count tests passed! ✅"
}

notify_tests_failed() {
    local count="${1:-some}"
    notify_error "$count tests failed! ❌"
}

# Git notifications
notify_push_success() {
    local branch="${1:-main}"
    notify_success "Pushed to $branch successfully! 📤"
}

notify_pr_created() {
    local pr_url="$1"
    notify_info "Pull Request created! 🔀"
}

# Timer/Reminder
set_reminder() {
    local seconds="$1"
    local message="${2:-Timer completed!}"
    
    echo -e "${CYAN}⏱️  Reminder set for $seconds seconds${NC}"
    
    (sleep "$seconds" && notify_info "$message" && speak "$message") &
}

# Progress notification
notify_progress() {
    local current="$1"
    local total="$2"
    local task="${3:-Task}"
    local percent=$((current * 100 / total))
    
    echo -e "${CYAN}📊 $task: $current/$total ($percent%)${NC}"
    
    if [ "$current" -eq "$total" ]; then
        notify_success "$task completed! 100%"
    elif [ $((current % 10)) -eq 0 ]; then
        notify_info "$task: $percent% complete"
    fi
}

# Main command handler
case "${1:-help}" in
    success)
        notify_success "${2:-Operation completed successfully}"
        ;;
    error)
        notify_error "${2:-An error occurred}"
        ;;
    warning)
        notify_warning "${2:-Warning}"
        ;;
    info)
        notify_info "${2:-Information}"
        ;;
    build-start)
        notify_build_started
        ;;
    build-success)
        notify_build_success "$2"
        ;;
    build-fail)
        notify_build_failed "$2"
        ;;
    deploy-start)
        notify_deploy_started
        ;;
    deploy-success)
        notify_deploy_success "$2"
        ;;
    deploy-fail)
        notify_deploy_failed "$2"
        ;;
    tests-pass)
        notify_tests_passed "$2"
        ;;
    tests-fail)
        notify_tests_failed "$2"
        ;;
    push)
        notify_push_success "$2"
        ;;
    reminder)
        set_reminder "$2" "$3"
        ;;
    progress)
        notify_progress "$2" "$3" "$4"
        ;;
    speak)
        speak "$2" "$3"
        ;;
    sound)
        play_sound "$2"
        ;;
    help|*)
        echo "Notification Helper for Smarter.Poker"
        echo ""
        echo "Usage:"
        echo "  $0 success <message>           - Success notification"
        echo "  $0 error <message>             - Error notification"
        echo "  $0 warning <message>           - Warning notification"
        echo "  $0 info <message>              - Info notification"
        echo ""
        echo "Build notifications:"
        echo "  $0 build-start                 - Build started"
        echo "  $0 build-success [duration]    - Build completed"
        echo "  $0 build-fail [error]          - Build failed"
        echo ""
        echo "Deploy notifications:"
        echo "  $0 deploy-start                - Deployment started"
        echo "  $0 deploy-success [url]        - Deployment completed"
        echo "  $0 deploy-fail [error]         - Deployment failed"
        echo ""
        echo "Other:"
        echo "  $0 tests-pass [count]          - Tests passed"
        echo "  $0 tests-fail [count]          - Tests failed"
        echo "  $0 push [branch]               - Push success"
        echo "  $0 reminder <seconds> <msg>    - Set reminder"
        echo "  $0 progress <cur> <total>      - Progress update"
        echo "  $0 speak <text> [voice]        - Speak text"
        echo "  $0 sound <file>                - Play sound"
        echo ""
        ;;
esac
