#!/bin/bash
# Prune non-linux-x64 platform binaries before next build.
#
# @ffmpeg-installer/ffmpeg and @ffprobe-installer/ffprobe ship binaries for
# every platform. Vercel builds exclusively on linux-x64, so all others are
# dead weight that push transcode-videos over the 300 MB function limit.
#
# Turbopack ignores outputFileTracingExcludes (webpack-only option), so
# physical deletion before `next build` is the only reliable fix.
#
# Two possible package layouts are handled:
#   A) Scoped optional deps  → node_modules/@ffmpeg-installer/<platform>/
#   B) Bundled inside main   → node_modules/@ffmpeg-installer/ffmpeg/<platform>/
# A find-based sweep is run as a final safety net.

set -e

echo "=== Platform binary pruning ==="
echo ""

echo "-- @ffmpeg-installer directory layout:"
ls -la node_modules/@ffmpeg-installer/ 2>/dev/null || echo "  (not found)"
echo ""
echo "-- @ffprobe-installer directory layout:"
ls -la node_modules/@ffprobe-installer/ 2>/dev/null || echo "  (not found)"
echo ""

echo "-- Binary files found before cleanup:"
find node_modules/@ffmpeg-installer -type f \( -name 'ffmpeg' -o -name 'ffmpeg.exe' \) 2>/dev/null | sort || true
find node_modules/@ffprobe-installer -type f \( -name 'ffprobe' -o -name 'ffprobe.exe' \) 2>/dev/null | sort || true
echo ""

echo "-- Sizes before cleanup:"
du -sh node_modules/@ffmpeg-installer/ 2>/dev/null || true
du -sh node_modules/@ffprobe-installer/ 2>/dev/null || true
echo ""

NON_LINUX=(darwin-arm64 darwin-x64 win32-ia32 win32-x64 linux-arm linux-arm64)

echo "-- Strategy 1: remove scoped optional-dep packages"
for platform in "${NON_LINUX[@]}"; do
  rm -rf "node_modules/@ffmpeg-installer/$platform"  && echo "  removed node_modules/@ffmpeg-installer/$platform"  || true
  rm -rf "node_modules/@ffprobe-installer/$platform" && echo "  removed node_modules/@ffprobe-installer/$platform" || true
done
echo ""

echo "-- Strategy 2: remove platform dirs bundled inside main package"
for platform in "${NON_LINUX[@]}"; do
  rm -rf "node_modules/@ffmpeg-installer/ffmpeg/$platform"  && echo "  removed node_modules/@ffmpeg-installer/ffmpeg/$platform"  || true
  rm -rf "node_modules/@ffprobe-installer/ffprobe/$platform" && echo "  removed node_modules/@ffprobe-installer/ffprobe/$platform" || true
done
echo ""

echo "-- Strategy 3: find-based sweep (catches any remaining non-linux-x64 binaries)"
find node_modules/@ffmpeg-installer -type f \( -name 'ffmpeg' -o -name 'ffmpeg.exe' \) 2>/dev/null \
  | grep -v '/linux-x64/' \
  | while read -r f; do rm -f "$f" && echo "  deleted $f"; done || true
find node_modules/@ffprobe-installer -type f \( -name 'ffprobe' -o -name 'ffprobe.exe' \) 2>/dev/null \
  | grep -v '/linux-x64/' \
  | while read -r f; do rm -f "$f" && echo "  deleted $f"; done || true
echo ""

echo "-- Sizes after cleanup:"
du -sh node_modules/@ffmpeg-installer/ 2>/dev/null || true
du -sh node_modules/@ffprobe-installer/ 2>/dev/null || true
echo ""

echo "=== Platform binary cleanup complete (linux-x64 retained) ==="
