#!/bin/bash
# Prune non-linux-x64 platform binaries before next build.
#
# @ffmpeg-installer and @ffprobe-installer ship binaries for every platform
# (darwin-arm64, darwin-x64, win32-*, linux-arm, linux-arm64, linux-x64).
# Vercel builds exclusively on linux-x64, so the rest are dead weight.
#
# Turbopack ignores outputFileTracingExcludes (webpack-only option), meaning
# ALL platform dirs get bundled into the function — causing the 670 MB error.
# Physical deletion before `next build` is the only reliable fix.
#
# Retained: @ffmpeg-installer/linux-x64  @ffprobe-installer/linux-x64
# Expected result: transcode-videos drops from ~670 MB to ~160 MB

set -e

for pkg in @ffmpeg-installer @ffprobe-installer; do
  for platform in darwin-arm64 darwin-x64 win32-ia32 win32-x64 linux-arm linux-arm64; do
    rm -rf "node_modules/$pkg/$platform"
  done
done

echo "Platform binary cleanup complete (linux-x64 retained)"
