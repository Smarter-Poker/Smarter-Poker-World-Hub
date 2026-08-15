# Social surface deep audit — feed, components, reels/stories, Go Live, data layer

Date: 2026-08-15
Author: Cowork agent (per Dan: "check everything line by line for any bugs,
gaps, stubs, regressions or wiring issues… check Go Live as well")
Method: five parallel line-by-line audit passes (feed page ~13k lines, Go
Live stack, social components, reels/stories/video, SocialService + all
pages/api/social routes), every finding re-verified against the live schema
(760 tables / PostgREST doc) and the live function catalog before fixing.
~60 findings; the verified ones fixed in this commit. Scanner re-run after:
0 phantom columns across 2,767 call sites.

## P0s fixed (features that could not work)

- **Every share link 404'd.** SharePostModal (copy/X/WhatsApp), messenger
  share cards and share-to-feed link posts all pointed at `/hub/post/<id>`
  — a route that never existed; SmarterPokerStyleCard's own share button
  used a third dead URL (`/app/social/post/…`). Added
  `pages/hub/post/[id].js` (server-side redirect into the feed's new
  `?post=` deep-link) and canonicalised the card URL.
- **SharePostModal "Groups" tab crashed on open**: `getAuthUser` used but
  never imported (ReferenceError), `getSupabase()` undefined, `SPAvatar`
  rendered but never imported, and `onClose` was wired to the backdrop
  handler (throws on `e.target`). All four fixed — sharing to group chats
  works for the first time.
- **Broadcaster self-join killed live streams**: a broadcaster tapping
  their own stream card or the PiP "return" arrow routed into
  `LiveStreamViewer.joinStream`, which tore down the broadcast room —
  video died for every viewer while the DB row stayed 'live'.
  `joinStream` now refuses self-join while broadcasting, and the PiP
  return routes broadcasters to the hub instead of `?stream=`.
- **"Edit Poker Near Me Details" panel was 100% dead**: it called
  `/api/commander/home-games/groups/[id]` — which never existed. Route
  created (GET/PATCH `contact_phone`/`website_url`, owner-authorized).
- **Club-page follow state never loaded**: the pages list sent
  `getAnonUserId()` ("anon-…", not a UUID) with no bearer token, so
  `is_following` was false on every card and "Show Following" always
  showed nothing. Now sends the real user + token.
- **Club dashboard posts never rendered their media** — uploads succeeded,
  cards showed text only. Media grid added.
- **SocialService follows were invisible platform-wide**: written to
  `social_connections` while every reader (profiles, reels, live, counts)
  reads `social_follows`. Code repointed + orphaned follows backfilled by
  migration.
- **Reactions were split-brained**: `/api/social/interactions` wrote
  emoji reactions to `social_interactions` (which nothing reads) while
  manually incrementing `like_count` — which `trig_sync_like_count` on
  `social_likes` also owns. Reactions now write `social_likes`; every
  manual like-counter mutation removed (trigger is the single owner).
- **Page-post media comments 500'd**: engage API wrote
  `media_url`/`media_type` — columns that existed on `social_comments`
  but not `social_page_post_comments`. Added by migration.
- **`user_dna_profiles` doesn't exist**: SocialService getPost/getComments/
  createComment/getConversations and the storage-usage meter all embedded
  it (PGRST200 every call). Repointed to `profiles` (id/level);
  getConversations rewritten on the conversation model; storage meter now
  sums the caller's `social_media` rows.
- **Stale `/commander/*` nav (4 buttons)** opened 404 tabs — repointed to
  `/hub/commander/…`.

## P1s fixed

Feed page: `?post=` deep-link handler added (notification taps and global-
search post results now navigate — both were no-ops); view counts and the
private-lock glyph now render (feed API returns `view_count`/`visibility`);
`isLiked` computed from the caller's own like rows (the 500-row page cap
made hearts render un-liked on hot posts, so tapping *removed* the like);
exact `hasMore` (limit+1 over-fetch); realtime INSERTs now show a
non-destructive "N new posts" pill instead of wiping every loaded page and
resetting scroll on every post platform-wide; deleted posts no longer
resurrect from the IndexedDB cache; the delete dialog's promised undo now
exists (actionable toast cancels the pending delete); typing-indicator
broadcasts reuse one channel instead of leaking one per keystroke; the
memo comparator no longer drops thumbnail/media/metadata updates; seat
"is me" matching uses player_id, not display-name collision.

Go Live: PiP camera button called `toggleVideo()` which never existed —
implemented; beauty-filter canvas froze the published video in hidden tabs
(rAF stops) — timer fallback added; viewer unmount now actually leaves the
stream (was leaking LiveKit rooms, zombie viewer rows, ghost PiP); the 3s
leave race no longer drops a still-connected Room (inflated viewer counts);
pre-flight zombie kill now ends streams properly (ended_at + feed-post LIVE
badge cleared); EndStreamModal gained an always-enabled "Close — decide
later" (a failed recording used to leave *Delete* as the only working
button) and a confirm on delete; the reconnect banner no longer silently
vanishes when two orphaned live rows exist; reaction counts on feed tiles
now increment (RPC was never called; direct writes are trigger-blocked).

Components/reels/stories: EnhancedPostCreator's catch block threw
ReferenceError on every upload failure (bgUnsub block-scoped inside try);
iPhone .MOV uploads never got the thumbnail picker (raw `file.type`
instead of sniffMimeType); home-group posts wrote `content_type:'media'`
(a value no renderer understands); EditPostModal reported success on
zero-row updates; TrendingPosts surfaced deleted/private posts;
NotificationFeed notified users about strangers' posts (unfiltered
realtime); story views recorded only the first story of a group (now
per-story, deduped); story videos hijacked iOS fullscreen (playsInline)
and were cut at a fixed 5s (timer now sizes to real duration, cap 30s);
reel dislike double-decremented like_count (trigger already handles it);
the first reel's view was never counted (effect deps); eviction wiped
`src` on a React-owned element; ReelsFeedCarousel refetched 50 reels on
every text post platform-wide (retired listener removed);
FullScreenVideoViewer lied about playing state under autoplay policies;
mention regex no longer renders emails as mentions or truncates dotted
usernames; ArticleCard decodes HTML entities; SharedPostCard's
`window.top` no longer throws cross-origin.

Security: feed API identity now derives from the JWT (the service-role
enrichment leaked any user's bookmark/like state to whoever passed their
uuid); SVG removed from upload allowlists (stored-XSS on the public storage
origin); page-post GET now honours visibility (private/home-game page posts
were enumerable, CDN-cached); home-game page follows require approval again
(`page_type` was read from metadata where it never lived); page role
changes target the right member row (owner was editing their own row);
rate limits added to share-reel-to-feed and upload-comment-image; raw
`@supabase/supabase-js` imports in three routes switched to the patched
client; internal geocode/auto-post calls now authenticate (both were
silently failing — new pages never got map pins, page-update auto-posts
never posted).

## Known-dead code intentionally left (documented, not "fixed")

`src/components/social/views/*` (FeedView/WatchView/ClubView/ProfileView),
`PokerFeedCard`, `PokerStoriesRow`, `SmarterPokerPhotos`,
`SmarterPokerReels`, and the barrel `src/components/social/index.js` are
imported by nothing reachable — including the WatchView video-player stub
and FeedView's hardcoded-empty reels rail. Fixing unmounted code is churn;
flagging for a future delete-or-mount decision. Same for `LinkPreviewCard`
and `ChatWindow` inside the feed page (defined, never rendered), the
`socialLinks` dead state, and `SpectatorView`'s token-but-no-player stub
(reachable from /hub/user/[username] live sessions — needs a real LiveKit
subscribe pass, tracked as follow-up). Additional follow-ups: co-host
invite links double as moderation grants (should be split from view-only
Share), `scheduled_lives` never pre-creates streams, and
`fn_auto_end_stale_streams` should take an explicit id list.

## Migrations (applied to prod first, mirrored here)

- `20260815_social_audit_page_comment_media_and_follows_backfill.sql`:
  `social_page_post_comments` +media_url/+media_type; backfill
  `social_connections` → `social_follows`.

## Verification

- esbuild syntax pass on all 40+ touched files; phantom-column scanner
  clean (0 findings / 2,767 call sites, stub updated with the new columns).
- `trig_sync_like_count` and `validate_social_like_post_id` definitions
  pulled from the live DB before touching any like-count code path.
- Deploy verification recorded in rollout below.
