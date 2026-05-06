# Audit: low-quality YouTube reels output (2026-05-06)

## Found
2,370 reels in storage at ~1 Mbps for 1080p vertical (vs 3-5 Mbps source).
Cause: ffmpeg re-encode at preset=fast/crf=23/profile=main.

## Fixed
- Worker now tries `-c copy` first (lossless), falls back to `preset=slow crf=18`.
- Thumbnails pulled from rawFile, not re-encode.
- Player error overlays bumped to maxresdefault.

## Verification
- Worker log shows `Remuxed (lossless)` on common path.
- Sample bitrates meet the >= 3 Mbps quality target.

## Deferred
Re-conversion of existing 2,370 low-quality MP4s — gated on cookie health.
