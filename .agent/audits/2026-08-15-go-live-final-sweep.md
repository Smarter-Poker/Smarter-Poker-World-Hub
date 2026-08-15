# Go Live final sweep — residual P0/P1 burn-down before claiming success

Date: 2026-08-15
Author: Cowork agent (per Dan: "run a final deep sweep to insure you have all
the bugs, gaps, stubs and wiring issues, and check for any and all improvements
and optimizations that can still be done to the go live functionality before
claiming success.")
Method: every remaining verified finding from the 7-agent secondary-dive swarm
that did NOT ship in 31bb9ce8 was re-verified against the current code (exact
line reads, not stale agent line numbers) and fixed in one batch. Two files
touched: GoLiveModal.jsx, EndStreamModal.jsx.

## Stability / crash-class fixes

- **Recording OOM (would kill live broadcasts ~1h in).** MediaRecorder chunks
  accumulate in RAM at 2.5Mbps ≈ 1.1GB/hour; iOS Safari OOM-kills the tab near
  1GB — taking the LIVE BROADCAST down, not just the recording. Added a 512MB
  cap (~28 min of video): the recorder stops, a toast explains, the broadcast
  continues. `finalizeRecording` now salvages the chunks when the recorder is
  already inactive (previously an early stop returned null and the streamer
  was told there was no recording at all).
- **Double-Blob on stop.** `mr.onstop` built a second full-size Blob in
  parallel with `finalizeRecording`'s — doubling memory at the worst possible
  moment. Removed (both recorder paths); finalize owns the blob.
- **Recording buffers were retained for the life of the page** — cleared on
  end-modal close and on force-close.
- **beforeunload killed streams the user chose to keep.** `endBroadcast()`
  fired inside beforeunload itself, which fires even when the user CANCELS the
  browser's leave prompt and stays. Warn-only in beforeunload; real teardown on
  `pagehide`. Guests now `leaveStream()` there instead of force-ending the
  HOST's stream.
- **Beauty canvas `captureStream(30)` was never stopped** — leaked a live
  30fps capture pipeline per broadcast. Stopped in both teardown paths.
- **Co-host video tiles never detached their LiveKit track** on unmount
  (media-element leak per guest churn). Detach on null ref.

## Reconnect-flow hardening (handleReconnectToExisting)

- `isManualDisconnect` is latched BEFORE dropping the old room (its async
  Disconnected event raced the replacement connection into the reconnect
  ladder), then cleared before `_connectRoom`.
- Installed the missing `onStreamEndedExternally` handler — a reconnected
  broadcaster whose stream was reaper-killed got no overlay and kept
  broadcasting into a dead room.
- `_subscribeToViewers` re-subscribed (gift toasts / external-end detection
  were dead after reconnect).
- Guest invite code re-fetched via `fn_get_my_guest_invite_code` — after
  reconnect, Share silently downgraded to the clipboard fallback and co-host
  invites could not be sent.
- Elapsed timer seeded from `started_at` (restarted at 00:00 mid-stream).

## UX correctness

- **Elapsed timer wall-clock anchored** (both start + reconnect). Background
  tabs throttle setInterval to ~1/min, so the p+1 counter drifted minutes
  behind real duration.
- **Thumbnail upload now runs IN PARALLEL with the countdown** — a slow upload
  used to run before the countdown started, freezing "Get Ready 5" for
  seconds. Countdown shows "Going Live / GO / Connecting" at 0, and a Cancel
  button (there was NO way to abort a mistaken Go Live tap).
- **"Waiting for camera permission..." could sit forever over a working
  preview**: the overlay keyed off `streamRef.current` (a ref — no re-render)
  and the fast-path state writes were no-ops. New `hasPreview` state; Go Live
  is disabled until a preview actually exists.
- **Permission denial now routes to the setup screen** — it has an explicit
  retry button and was previously dead code (nothing ever set stage='setup').
- **Live-stage errors were mute**: camera-flip failures and rejected comments
  (ban / slow mode) called `setError`, which only renders in the preview
  stage. Both now toast.
- **Slow mode had a full handler + a SLOW badge but NO control called it.**
  Broadcaster-only FAB added; the optimistic flip reverts on server failure.
- **EndStreamModal's "Close — decide later" lied** — the recording is never
  uploaded on that path. Now "Discard recording & close" with a confirm when a
  recording exists ("Close" when there is none).
- Optimistic broadcaster comments respect the AUDIT-C 200-comment buffer cap;
  GuestInviteModal re-open shows a spinner again + post-unmount setState
  guard; ScheduleLiveModal success is toasted (result was silently dropped);
  dead `controlsTimer` state removed.

## Verification

esbuild clean on both files; phantom scanner 0 findings / 2,771 refs / 761
tables; no DB changes this pass. Shipped as bdc1627762 via the byte-exact
patch transport (blob hashes matched on the Mac before push). The commit's own
Build Safety Gate run was superseded (cancel-in-progress) by the club-arena
sync bot's a00d99d233 — which contains bdc1627762's tree verbatim — and that
run completed GREEN (all checks incl. CHECK 13). Production /api/health
serving a00d99d2 at 2026-08-15T07:10Z.

## Still-open follow-ups (documented, needs Dan or a future pass)

Unchanged from the secondary-dive list: per-invite single-use tokens; LiveKit
webhook receiver to replace heartbeat heuristics; start-stream.js deletion;
HEIC→JPEG normalization; preview-token.js ban check; receiver 30-day cap 10×
smaller than per-gift cap; co-host Share/Invite split (Dan decision); Hetzner
SSH + watchdog GITHUB_TOKEN secrets (Dan-only).
