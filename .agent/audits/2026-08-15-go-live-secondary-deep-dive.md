# Go Live secondary deep dive — 7-agent swarm, guest management, gifting, thumbnails

Date: 2026-08-15
Author: Cowork agent (per Dan: "deeper dive into Go Live, launch a swarm, check
line by line, then check all functionality. Make gifting work perfectly, guests
addable/removable anytime, invite+acceptance work, guests can share the stream to
their feed, and the thumbnail is perfect when uploading the video.")
Method: 7 parallel line-by-line audit agents over GoLiveModal (3,914 lines),
LiveStreamService (1,650), LiveStreamViewer (2,247), all /api/live routes,
gifting, the guest/co-host flow, and the thumbnail pipeline. ~90 findings; the
verified high-value ones fixed here. Every DB claim checked against the live
function/table definitions before acting.

## Dan's five requirements — what was broken and what shipped

### 1. Gifting works perfectly
- **Send caps were dead (economy hole).** `sum_diamond_transactions` does
  `SUM(amount)`; debits are stored NEGATIVE, so the 24h fresh-paid cap (500)
  and the 30-day source-tier cap both read ≤0 and never fired — unlimited
  sending. Fixed with `Math.abs()` at the three send-cap call sites (the
  receive cap sums positive credits, left as-is).
- **Diamonds could be destroyed silently.** A null/undefined `creditResult`
  (PostgREST schema-cache race) was treated as a successful credit, charging
  the sender while crediting nobody. Now requires explicit
  `success===true || duplicate===true`, else refunds.
- **Credit idempotency guard was global, not per-user** — a client-chosen
  idempotency key could collide with another user's gift reference and make a
  real debit credit nothing. `add_diamonds_to_balance` duplicate check is now
  scoped `AND user_id = p_user_id` (migration).
- **Gift-row write error was discarded** — a failed `live_gifts` insert after a
  successful transfer left the gift out of top-gifters/analytics while the API
  said success. Now logged loudly and surfaced as `recorded:false`.
- **Gift message was unbounded** (payload/XSS risk) — capped at 200 chars,
  trimmed.
- (`deduct_diamonds` diamond_balance drift, flagged by an agent, was a false
  positive — the live function already sets both columns correctly.)

### 2. Guests addable AND removable at any time
- **There was NO way to remove a guest.** Added a full kick path:
  `live_guest_revocations` table + `revoke_guest` action in `/api/live/moderate`
  (broadcaster-only: records the revocation, then `RoomServiceClient.
  removeParticipant` evicts every LiveKit identity for that user) + a "Remove"
  button on each co-host video tile in GoLiveModal. The revocation makes the
  kick STICK — `token.js` now checks `live_guest_revocations` in the guest
  branch, so auto-reconnect can't re-mint a publish token with the cached code.
  The removed guest can still watch as a plain viewer.
- **Added `rotate_invite`** (`fn_rotate_guest_invite_code`, broadcaster-only) to
  invalidate all outstanding invite codes at once, plus a `LiveStreamService.
  rotateInvite()` client method.
- **A guest could invite unlimited further co-hosts** with the host's code — the
  share/invite modal is now gated behind `!guestMode`.
- **Co-host moderation outlived participation** — a banned/removed co-host kept
  full comment-delete/pin authority forever (pure code-equality check). Now
  `moderate.js` rejects co-host moderation when the stream isn't live or the
  caller is banned/revoked.

### 3. Invite AND acceptance work
- **Acceptance only worked via a transient realtime toast.** In the message
  thread the invite rendered as raw `[LIVE_INVITE]room=…&invite=…` text with no
  action, and the notification tap fell through to a generic route. Added a
  tappable "Join Live" card branch to `MessageBubble.js` and a `live_invite`
  branch to `pages/hub/notifications.js` → both open `/hub/live/guest?…`.

### 4. Guests can share/post the live stream to their feed
- **Neither the broadcaster nor guests could post the stream to their feed** —
  the only caller of `/api/live/share-stream-to-feed` was the passive viewer,
  and `handleShare` short-circuited to the invite modal. Added a "Post to my
  feed" (📣) control to the live stage for broadcaster AND guests.
- **`share-stream-to-feed` never wrote `thumbnail_url`** (blank shared card) and
  had no eligibility gate — added the poster field, a live/ended-and-not-draft
  check, and a blocked-relationship check. Viewer share now uses a fresh token
  (was 401ing on long streams) and is gated on auth.

### 5. Thumbnail perfect on video upload
- **iPhone "Most Compatible" + Android H.264 `.mp4` was never queued for
  server-side thumbnail extraction** (the trigger matched .mov/.hevc/.heic/.mkv/
  .avi/.webm but not .mp4/.m4v) → permanently blank feed cards. Added .mp4/.m4v
  to `fn_queue_video_transcode` (and gated it on a missing thumbnail) + a 30-day
  backfill re-queue.
- **A failed manual cover produced no thumbnail** — the auto-capture fallback
  lived in an `else if`, so a picked-but-failed image (HEIC/oversized/network)
  went live thumbnail-less with no feedback. Restructured to fall through to an
  auto-captured camera frame + a toast.
- **Storage extension derived from filename** (extensionless/HEIC names →
  broken keys) — now derived from the validated MIME.
- **EndStreamModal could ship a black poster** from a not-yet-decoded recording
  frame (fell back to a 640×360 black canvas) — now bails when videoWidth is 0.
- **EndStreamModal clobbered a just-persisted thumbnail with an explicit null**
  on Post/Save — now only writes `thumbnail_url` when one actually exists.
- Removed the double delete-confirm in EndStreamModal.

## Service / viewer robustness (correctness + leaks)
- **`leaveStream` reset `isManualDisconnect` to false**, so the async
  `RoomEvent.Disconnected` fired the reconnect ladder against a null stream —
  ~62s of phantom "Reconnecting…" after a normal leave. Now left latched; also
  resets `isBroadcaster` so a departed guest doesn't keep broadcaster state.
- **A leaving co-host's tile never disappeared** — the disconnect handlers fired
  `onParticipantListChange`, which no component assigns. Added a single
  `_emitParticipants()` helper fired from connect/disconnect/track-unsubscribe.
- **A swapped/left track stayed in the synthetic remote stream** (PiP froze on
  the last frame) — `TrackUnsubscribed` now removes it and re-emits participants.
- **Viewers had no way to unblock autoplay-blocked audio** (silent stream on
  iOS Safari / deep-link joins) — added `LiveStreamService.startAudio()` +
  `AudioPlaybackStatusChanged` wiring and a "🔊 Tap for sound" viewer overlay.
- **The viewer's invite/recent-chats panel was dead** — `LiveViewerList` never
  received `currentUser`/`inviteCode`; now passed through.
- `isStarting` is reset when the GoLive modal closes (button-lockup fix); co-host
  pin/delete now pass the invite code so they actually authorize; the Ban button
  is hidden for guests (server rejects it anyway).

## Non-issues (agent claims that did not survive verification)
- `live_comments`/`live_pins`/`live_streams` are all `REPLICA IDENTITY FULL`, so
  the realtime-DELETE filter findings were false.
- `deduct_diamonds` already updates `diamond_balance` in prod.

## Migration (prod-first, mirrored)
`20260815_go_live_guest_mgmt_thumbnail_gift_hardening.sql`: `live_guest_revocations`
table; `fn_rotate_guest_invite_code`; `.mp4/.m4v` in `fn_queue_video_transcode`
+ thumbnail-less backfill; user-scoped `add_diamonds_to_balance` duplicate guard.
economy_invariants asserted clean post-apply.

## Known follow-ups (documented, not shipped this pass)
Per-invite single-use tokens (replace the shared code entirely); LiveKit
`updateParticipant` to demote-in-place instead of evict; a `/api/livekit/webhook`
using `WebhookReceiver` to replace the heartbeat/cleanup-stale heuristics;
`start-stream.js` deletion; a connection-state machine + watchdog for the viewer
black-screen strands; HEIC→JPEG canvas normalization; `preview-token.js` ban
check; the receiver 30-day cap (1,000) being 10× smaller than the per-gift cap.

## Verification
All 10 touched files pass esbuild; phantom scanner clean (0 / 2,771 refs / 761
tables). Rollout: shipped as 31bb9ce880, Build Safety Gate GREEN, production
/api/health serving it. Migration verified live (live_guest_revocations +
fn_rotate_guest_invite_code present); economy_invariants clean; the thumbnail
backfill re-queued 1,266 previously-blank video posts for server-side
extraction.
