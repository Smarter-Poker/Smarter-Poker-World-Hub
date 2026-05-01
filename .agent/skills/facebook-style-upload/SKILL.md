---
name: Facebook-Style Photo & Video Upload
description: "Authoritative reference for the Facebook mobile photo/video upload pipeline — protocol, UX flow, and processing — used as the target for smarter.poker's 1:1 clone."
---

# Facebook-Style Photo & Video Upload — Reference Skill

> Read this before touching any code on the post composer, upload pipeline, transcode worker, feed video card, or background upload module. The smarter.poker target is a 1:1 clone of the FB iOS upload UX with feature parity on the backend.

## Sources of truth

The document below is synthesized from public Meta engineering posts, Graph API documentation, third-party reverse-engineering, design teardowns, and direct observation of the FB iOS app screens. URLs at the end. Do not reproduce verbatim from any source — this is the synthesized model.

---

## 1. The end-to-end flow (iOS native app)

```
[Composer]
   │  user taps Photo/Video
   ▼
[Picker screen]              ← native PHPickerViewController on iOS app;
   │                           on web: HTML <input type=file multiple>
   │                           routed into a custom React grid renderer
   │  multi-select with numbered circles (1,2,3…)
   │  bottom-bar shows selected items horizontally
   │  "Next" enables when ≥1 selected
   ▼
[Edit screen — "New reel"]
   │  preview tile with "Edit" overlay (trim/filters/music/captions/cover)
   │  Public ⌄  ·  + AI label off ⌄
   │  Description text input + hashtags + @mentions
   │  Location (with GPS-suggested places)
   │  Tag and collaborate
   │  Share to groups
   │  Add topics
   │  Share to your story
   │  [Post now] sticky button (full width, bottom)
   ▼
[Edit cover screen]
   │  large frame preview
   │  horizontal scrubber strip — 8 evenly-spaced frames extracted client-side
   │  selected frame outlined blue
   │  "+ Add from gallery" button → secondary picker
   │  "Save" top-right
   ▼
[Feed]
   │  ghost card slides into top of feed
   │  upload progress visible inline (bytes uploaded, ETA)
   │  user can navigate away — upload continues via NSURLSession background
   │  on completion, ghost card swaps for the real post
   │  copyright scan runs async; if matched, mute/restrict applies post-hoc
```

## 2. Upload protocol — Facebook Resumable Upload (FBRU)

Three phases, all over HTTPS to graph-video.facebook.com:

**Phase 1 — Start.** Client POSTs metadata (`upload_phase=start`, `file_size`). Server returns `{video_id, upload_session_id, start_offset, end_offset}`. The first chunk runs from start_offset to end_offset.

**Phase 2 — Transfer.** Client POSTs each chunk with `upload_phase=transfer`, `start_offset`, `upload_session_id`, and the binary chunk body. Server responds with the next `start_offset`/`end_offset` pair until file is complete. Sequential, NOT parallel — server enforces strict offset monotonicity to keep reassembly simple.

**Phase 3 — Finish.** Client POSTs `upload_phase=finish` with `upload_session_id`. Server queues the file for processing and returns success.

Chunk size: **8 MB** is the published default for Graph API; **1–2 MB** on mobile FB app for resilience on flaky cellular. Resume on failure: client tracks the last acknowledged offset and resumes from there — no full re-upload.

Auth: every chunk request carries the user's access token. Token expiry mid-upload is handled by the FB app refreshing in the background and retrying the failed chunk with the new token.

## 3. Server-side processing pipeline

After `upload_phase=finish`:

1. **Format normalization** — incoming HEVC/H.265 (MOV) is transcoded to H.264 + VP9 + AV1 outputs at multiple resolutions (240p, 360p, 480p, 720p, 1080p, 4K).
2. **Multi-encoder ffmpeg** — Meta runs a single decode that fans out to N encoders in parallel. ~40% faster than separate passes.
3. **MSVP custom ASIC** — Meta's "Meta Scalable Video Processor" hardware accelerator handles VOD transcoding. Per Meta engineering, Instagram saw 94% compute time reduction by using MSVP-optimized ABR repackaging instead of full re-encodes per resolution.
4. **Adaptive bitrate (ABR)** — DASH (and HLS) manifests generated, pointing to all resolution variants. Player picks tier based on bandwidth.
5. **Thumbnail extraction** — multiple frame candidates extracted (heuristic + likely scene-change scoring); first frame default unless author picks via Edit cover screen.
6. **Audio extraction** — separate AAC mono track for fingerprinting.
7. **Rights Manager scan** — sonic + visual fingerprint matching against rights-holder database. 3-second clip threshold for matches. Result delivered async; if matched, mute/restrict/strike applied to already-published post.
8. **CDN distribution** — bytes pushed to FB Edge + Akamai POPs.

Approximate latency for a 1-min iPhone HEVC clip: 30–50 seconds server-side after upload completes. Post is visible on feed within 1–2 seconds of `upload_phase=finish` returning success — processing happens around it, not before.

## 4. Mobile-specific (iOS native app)

- **PhotoKit** — uses `PHPickerViewController` to read assets directly without per-asset permission prompts.
- **Hardware decode** — HEVC frames pulled via `AVAssetReader` for cover-frame extraction; canvas readback works because the native app has access to PixelBuffer, unlike Safari WebKit.
- **NSURLSession background** — uploads continue when app is suspended (iOS will resume the session on its own schedule).
- **Photo asset URL** — uploads from disk URL, not memory blob, so memory pressure is bounded.
- **iCloud photos** — if the asset isn't on-device, iOS streams it from iCloud during upload (slower but transparent).

## 5. Mobile WEB (m.facebook.com / facebook.com on iPhone Safari)

- **HTML file picker** — `<input type="file" accept="image/*,video/*" multiple>` opens iOS Photos picker. Multi-select natively supported but the picker UI is iOS-controlled.
- **No PhotoKit access** — Safari cannot reach `PHAsset` URLs; only File objects via the input event.
- **Single-page edit flow** — web condenses picker → edit → post into one page (vs three on native).
- **Upload via XHR with progress** — same FBRU protocol, just transported through `XMLHttpRequest.upload.onprogress` events.
- **No background upload** — if the tab navigates or closes, the upload aborts. (FB has a "Continue uploading?" warn-on-unload.)
- **Cover frame extraction** — server-side after upload, since `<canvas> drawImage()` cannot reliably read HEVC frames on iOS Safari.

## 6. UX details (verified vs inferred)

**Verified from public docs/screenshots:**
- Privacy default is per-user remembered (last selection wins)
- AI label required when content is photorealistic and AI-altered — Meta policy enforces flagging
- Tag and collaborate: invited co-author accepts → post publishes to both accounts
- Topics from admin-defined list per group
- Edit overlay opens an in-app editor with trim, filters, music (genre-categorized library), captions (auto-transcribed, font/color editable), and cover

**Inferred from observed UX patterns (not in public docs):**
- Multi-select max ~10 items per post
- Cover scrubber: 8 frames evenly spaced across video duration
- Currently-selected cover frame: blue 2–3px outline
- Album picker grid: 3 columns, square thumbnails, duration overlay on bottom-right of video tiles, selection circles in top-right
- Bottom-of-picker thumbnail strip: shows selected items in tap order with × to remove

## 7. Speed implications (inferred per technique)

| Technique | Speedup | Trade-off |
|---|---|---|
| 8 MB chunks (vs 1 MB) | ~25% on stable networks | More to re-send on chunk failure |
| Sequential resume | ~30% on flaky networks | No parallelism on stable networks |
| MSVP ASIC | 94% compute reduction | Datacenter only, not portable |
| Single-decode multi-encode | ~40% | Frame sync overhead |
| Async Rights Manager | Zero blocking latency | Possible mute-after-publish UX friction |
| Background NSURLSession | Decouples upload from app lifecycle | Native-only; no web equivalent |

For a 1:16 iPhone video at 100 Mbps:
- Upload: ~90 s (sequential 8 MB chunks)
- Server processing: ~30–50 s
- Rights scan: ~3–5 s (async, non-blocking for user)
- **User-perceived total: ~2:00–2:30**

This matches the 2:36 Dan reported from Facebook.

## 8. What we can clone vs what requires native

**Clonable on web today:**
- Multi-step flow (picker → edit → cover → feed)
- Custom album picker grid with numbered selection circles + tap-order
- Edit screen with description, location, visibility, AI label, etc.
- Edit cover screen with frame scrubber (frames extracted server-side via ffmpeg cron)
- Sticky "Post now" CTA
- Ghost card with progress in feed
- Background upload (via Service Worker + IndexedDB persistence — not as durable as NSURLSession but works in mobile Safari)
- Resumable chunked upload (we have TUS at 16 MB — close to FB's 8 MB)
- Server-side multi-resolution transcode (we have ffmpeg cron, would need to extend)
- ABR (HLS) playback (would need HLS.js)
- Async fingerprint-based copyright detection (third-party API like Pex, ACRCloud)

**Requires native iOS app (Capacitor/React Native/Swift):**
- True NSURLSession background uploads
- PHPickerViewController for native album access
- Hardware-accelerated HEVC frame readback for client-side cover preview (avoids server roundtrip)

For a 1:1 web clone, accept these gaps and use server-side fallbacks for the native-only items.

## 9. Sources

- developers.facebook.com/docs/video-api/guides/upload — FBRU protocol shape
- engineering.fb.com/2026/03/02/video-engineering/ffmpeg-at-meta-media-processing-at-scale — MSVP, single-decode multi-encoder
- engineering.fb.com/2012/03/09/core-infra/under-the-hood-building-the-location-api — Places API
- transparency.meta.com/governance/tracking-impact/labeling-ai-content — AI label policy
- facebook.com/business/help/1548693938521733 — Rights Manager
- facebook.com/business/help/1139754056567362 — Creator collaborations
- facebook.com/help/325807937506242 — Audience selector memory
- facebook.com/help/744744347616089 — Reel description editing
- pageflows.com/ios/products/facebook — UX teardown reference

(Last verified 2026-04-30. Re-validate before relying on protocol-level claims older than 12 months.)
