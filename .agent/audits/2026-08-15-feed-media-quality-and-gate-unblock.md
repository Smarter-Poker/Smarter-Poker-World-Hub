# Feed media quality (capture side) + CHECK 10 unblock + a conversation-RPC IDOR

Date: 2026-08-15
Author: Cowork agent
Trigger: "continue onto the next phase, make sure this is 100% completed
before claiming success." Chosen phase: Dan's still-open ASAP complaint —
"all of the videos and images posted in the feed are grainy and distorted."

Shipped: 0ea49efb23 (capture quality), 7ae2fab964 (security + gate).
Production /api/health served c02ff5a0 at 2026-08-15T15:58:02Z; both commits
are ancestors of it. Build Safety Gate GREEN on c02ff5a0e1, CHECK 10 included.

## 1. Why the grain was still there

The earlier pass fixed the YouTube poster ladder in `SmarterPokerStyleCard`.
That was only one of the sources. The capture side was still producing the
grain for every NEW upload:

- **Video posters were generated at 480px / q0.70.** The poster IS the feed
  tile until the viewer taps play, and the tile is bled to full card width
  (`.sp-post-media` margin -16px each side). On a 2-3x DPR phone that 480px
  JPEG is painted into 750-1125 physical pixels. That upscale is the grain.
- **The thumbnail picker was worse than the default.** `generateFrames()`
  renders the filmstrip at 360px / q0.65 because the tiles display at ~64px
  — but picking one handed that 360px tile straight through as the post's
  real `thumbnail_url`. Choosing a custom cover made the poster WORSE than
  not choosing one. The auto-select-first-frame path did it silently on
  every picker open.
- **Photos** were transcoded at 1920 / q0.85 through a canvas with the
  DEFAULT resampler. A modern phone shoots 4032px; the 2x+ downscale through
  a box filter aliases hard on fine detail (felt texture, card pips, small
  text) — that aliasing is literally the "grain". PNG sources (screenshots,
  GTO charts, range grids — text and flat colour) were forced to JPEG, which
  rings around every glyph: the "distorted" half of the complaint.

### Fixed
- `videoCompressor.generateThumbnail`: 480 -> 1280, q0.70 -> q0.92.
- New `captureFrameAt(file, timeSeconds)`: the picker keeps its cheap tiles
  for display and re-captures the CHOSEN timestamp at poster quality. Wired
  into both the click-select and the auto-select paths, with the tile shown
  instantly and the high-res swapped in when ready. Bounded at 8s so a
  failed recapture can never block a post; falls back to the tile.
- `imageSmoothingQuality='high'` on every downscale (poster, filmstrip,
  photo).
- `compressImage`: 1920 -> 2560 max edge, q0.85 -> q0.92, and PNG sources
  now encode to WebP q0.95. Browsers that can't encode WebP fall back to
  lossless PNG per the `toBlob()` spec. Both upload allowlists
  (`upload.js`, `upload-url.js`) already accept `image/webp`; both profile
  callers derive extension/MIME from the returned File, so `.webp` flows
  through. The `blob.size < file.size` guard is retained, so a re-encode
  that comes out larger keeps the original.

## 2. Measured, not assumed — and a bigger finding

32 random production posters were downloaded and measured:

| dimensions | count |
|---|---|
| 1920x1080 | 6 |
| 720x1278 / 720x1282 / 608x1080 / 360x640 (portrait) | 12 |
| 720x406 | 7 |
| 640x360 | 2 |
| 202x360 | 3 |

The worker extracts posters from the pristine source at NATIVE resolution
(`-q:v 2`), so poster dimensions mirror the ingested video. ffprobe on the
stored MP4s confirmed it directly:

```
post1  video=640x360  poster=1920x1080
post2  video=640x360  poster=1920x1080
post3  video=202x360  poster=202x360
post4  video=202x360  poster=202x360
post5  video=202x360  poster=608x1080
post6  video=202x360  poster=608x1080
```

**A share of the feed's videos are themselves 360p or worse — 202x360 in the
worst cases.** No poster change can fix that; a 202px-wide video played at
full width on a phone is a ~5x upscale. Note posts 1 and 2: a 1920x1080
poster on a 640x360 video means a 1080p source WAS available and the stored
video is not the HQ re-encode. `transcode_status` is NULL on all of them —
they never went through the HQ path.

Corpus shape (video posts, not deleted): 15,994 total — 10,725 with no
poster at all, 5,265 storage-hosted, 3 client-generated. A handful of source
videos are duplicated across 100+ posts each, so re-ingesting a small number
of sources would fix a disproportionate number of posts.

**Not actioned, deliberately.** The Hetzner worker is alive and healthy
(jobs completing at 15:31 today) so a backfill needs no SSH — but it already
has a 543-job backlog and 791 recent timeout failures. Queuing a
15k-post re-ingest is an infrastructure-load decision for Dan, not an
agent's call. Recommended: re-ingest by DISTINCT source video, worst
resolution first, in small batches.

## 3. CHECK 10 was red on every push — and was hiding a security hole

CHECK 10 (Diamond economy invariants) had been failing on every push with
Postgres 57014 "canceling statement due to statement timeout" — a
performance failure, not an economy violation. Per CLAUDE.md 11.4 a
permanently-red gate masks real checks; that is exactly how the 2026-07-31
news-digest incident hid a 500-diamond-per-signup money bug. Fixed, not
waited out.

Root cause: three of the twelve invariants read `information_schema`, whose
views expand ACLs row-by-row over `pg_class` x `pg_attribute` with no useful
index. The worst ran a correlated `role_table_grants` subquery ONCE PER
TABLE across 732 public tables. Rewritten onto `has_table_privilege()` /
`has_column_privilege()`, which are strictly MORE correct as well as faster:
they report the EFFECTIVE privilege, so they also catch a write reachable
via PUBLIC or role membership — grant paths the explicit-grant views miss.

Equivalence was verified against the live catalog BEFORE applying: all three
old/new pairs returned identical sets (symmetric difference 0), plus a
detection sanity check proving the new predicates are not trivially false
(694 of 732 tables client-insertable; 2 of 2 column grants seen).

**Measured: 1497ms / 115,664 shared buffers -> 142ms / 4,592 buffers.**

### The hole the timeout was hiding
The migration's own post-apply assertion refused to commit and named a
genuinely failing invariant: `anon_mutating_definer_functions_check_auth_uid`.

`fn_get_or_create_conversation` — BOTH `p_user_id` overloads — is
`SECURITY DEFINER`, was `EXECUTE`-able by `anon`, and took the caller's
identity as a PARAMETER. Any caller, including an unauthenticated one, could
create a `social_conversations` row plus participant rows binding two
arbitrary users: an IDOR and an unauthenticated spam vector.

Fixed: `p_user_id` is pinned to `auth.uid()` in both overloads and EXECUTE
is revoked from `anon`. Behaviour-preserving — both live callers
(`SharePostModal.jsx` and `MessagingService.js`) already pass the caller's
own id as `authenticated`. MessagingService uses the separate
`(user1_id, user2_id)` messenger_* overload, which was not touched.

## Migration
`20260815_secure_get_or_create_conversation_and_speed_economy_invariants.sql`
— applied to production first via Supabase MCP `apply_migration`, mirrored
verbatim, with a pasted ROLLBACK section. Self-aborting assertions: 12
invariants present, zero failing, anon EXECUTE revoked. All 12 pass.

## Verification
esbuild clean on all three JS files; byte-exact blob match on the Mac before
each push; Build Safety Gate GREEN on c02ff5a0e1 with CHECK 10 passing for
the first time in this session; production serving c02ff5a0.

## Open / needs Dan
1. **Low-resolution source videos** (section 2) — needs a decision on
   re-ingest batch size given the existing worker backlog.
2. **Receiver 30-day gift cap is 1,000** while a single gift may be 10,000,
   and senders graduate to unlimited at 120 days while receivers never
   graduate. A popular broadcaster is hard-capped at 1,000 diamonds/30 days.
   This is a monetization policy number, so it is flagged rather than
   changed.
3. Unchanged Go Live follow-ups: per-invite single-use tokens; LiveKit
   webhook receiver; `start-stream.js` and `preview-token.js` are both
   provably dead (zero callers) and `preview-token.js` additionally violates
   Immutable Rule 4 (raw `@supabase/supabase-js` in an API route);
   HEIC->JPEG normalization; `fn_auto_end_stale_streams` explicit id list.
