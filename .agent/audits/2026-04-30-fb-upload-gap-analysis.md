# FB Upload 1:1 Clone — Gap Analysis

Date: 2026-04-30
Reference: `.agent/skills/facebook-style-upload/SKILL.md`
Goal: bring smarter.poker to feature parity with Facebook's mobile photo/video upload flow.

## Current state — what we already have

| Component | Status | File |
|---|---|---|
| Composer (single screen) | Live | `src/components/social/SharedPostCreator.jsx` |
| iOS native picker via HTML input | Live | line 1706 (`<input type="file" multiple accept="image/*,video/*" />`) |
| Banner during picker handoff | Live | line 1657 (position:fixed top:0 zIndex:999999, picker→loading→staging stages) |
| Inline staging tiles in composer | Live | rendered from `media[]` state |
| Background-capable TUS upload | Live | `src/lib/backgroundVideoUpload.js` (16 MB chunks, AUDIT-19) |
| Ghost post card in feed | Live | `src/components/social/GhostPostCard.jsx` |
| Client-side thumbnail extraction (H.264) | Live | `src/lib/videoCompressor.js::generateThumbnail` |
| Server-side thumbnail extraction (HEVC fallback) | Live (AUDIT-20) | `pages/api/cron/transcode-videos.js` line 234-291 |
| HEVC → H.264 server transcode | Live | same cron, single resolution baseline |
| Public/Friends visibility toggle | Live | SharedPostCreator line ~1768 |
| Check-in / location | Live for check-ins | SharedPostCreator line ~1753, separate from compose |
| Session-resilient post creation | Live (AUDIT-15..18) | session preflight with timeout-guarded refresh |
| Real-time feed update on new post | Live | broadcastSync + Supabase realtime subscription |

## Gap matrix — FB has it, we don't

Tier P0 = blocks the user-facing UX Dan asked for.
Tier P1 = quality-of-life features Dan will request next.
Tier P2 = backend parity, not user-visible immediately.
Tier P3 = native-only or platform-restricted, deferred indefinitely.

| # | FB feature | Tier | Our gap | Concrete fix |
|---|---|---|---|---|
| 1 | Multi-screen flow: Picker → Edit → Cover → Feed | **P0** | All inline in one composer | New routes `/hub/social-media/compose/edit` and `/hub/social-media/compose/cover`. Lift media + draft state into a Zustand store (`src/stores/composeStore.js`) so transitions don't lose state |
| 2 | Custom album-picker grid (3 col, square thumbs, numbered selection circles, ordered tap-list at bottom, "Next" CTA) | **P0** | Native iOS picker only — no in-app grid | New component `src/components/social/AlbumPicker.jsx`. iOS native picker still does the asset access, but we render the resulting File[] in a custom grid where user can re-order / deselect / pick more before tapping Next |
| 3 | Edit cover screen with frame scrubber | **P0** | Missing entirely | New component `src/components/social/CoverFramePicker.jsx`. Frame strip extracted server-side: extend `pages/api/cron/transcode-videos.js` to extract 8 evenly-spaced frames (currently extracts 1). Store URLs in `social_posts.cover_frames TEXT[]`. Component PUTs `social_posts.thumbnail_url = chosen frame` |
| 4 | Description with #hashtags + @mentions inline highlight | **P1** | Plain textarea | Mentions parser (already exists for posts) — render highlighted spans as user types. New component `src/components/social/DescriptionEditor.jsx` |
| 5 | Location row → suggestion list (GPS-based) | **P1** | Check-in modal exists separately | Reuse `<CheckInModal>` logic; route the chosen venue into `social_posts.metadata.location` instead of creating a check-in. Show inline as a row in the edit screen |
| 6 | AI label toggle | **P1** | Missing | Add `social_posts.ai_label` BOOLEAN column. Toggle in edit screen. Backend stores; feed card displays "AI generated" badge when true |
| 7 | Tag and collaborate (co-author) | **P1** | Missing | New table `social_post_collaborators (post_id, user_id, accepted_at)`. Composer lets you @-tag a co-author; their feed shows a notification "X invited you to co-author"; on accept, post appears on both feeds |
| 8 | Share to groups (parallel post) | **P1** | Missing | Composer lets you select N home groups; on Post, `fn_create_social_post` runs once for personal feed + N times for each group_id in metadata |
| 9 | Add topics | **P2** | Missing | New table `social_topics (id, name, slug)`; `social_post_topics (post_id, topic_id)` join. Topics are admin-defined per Club Page; the composer pulls from `topics` if posting to a Club Page |
| 10 | Share to your story | **P1** | Stories exist (`fn_create_story`) but no toggle in composer | Add checkbox in edit screen; on Post, after `fn_create_social_post` succeeds, call `fn_create_story` with the same media. Stories already auto-expire 24h |
| 11 | In-app video editor (trim, filters, music, captions) | **P2** | Missing | Defer — pure web is hard for trim/captions without a heavy editor lib. Could use ffmpeg.wasm for trim only; recommend MVP: trim only, then add filters/captions later |
| 12 | Audience: Friends except / Specific / Custom list | **P1** | Public/Friends only | Extend visibility enum: `public, friends, friends_except, specific, only_me, custom`. New table `social_post_audience (post_id, user_id, mode)` stores the inclusion list per post. Filter logic in `/api/social/feed` uses it |
| 13 | Last-audience memory | **P1** | Forgets between posts | Persist last `visibility` to localStorage on Post; default the next composer to that value |
| 14 | Multi-resolution transcoding (240/360/480/720/1080/4K) | **P2** | Single 480p H.264 baseline | Extend `transcode-videos.js` to emit ladder of resolutions (`-vf scale=W:H` × N). Output as DASH manifest. Adds ~3-5x ffmpeg work per upload — consider moving to dedicated Hetzner worker, not Vercel |
| 15 | Adaptive bitrate (HLS or DASH) playback | **P2** | Plain MP4 `<video>` element | After multi-res transcode, use `hls.js` or `dash.js` in `SmarterPokerStyleCard.jsx`. Player auto-picks tier based on bandwidth |
| 16 | Async copyright detection | **P2** | Missing | Integrate ACRCloud or Pex API in `transcode-videos.js`. On match, mark `social_posts.copyright_status='matched'` + apply mute/restrict to playback in `SmarterPokerStyleCard.jsx` |
| 17 | True NSURLSession background upload | **P3** | Web-only — tab close kills upload | Mitigate with `beforeunload` warning (already implemented in bgUpload). True native = Capacitor wrapper, deferred |
| 18 | PHPickerViewController for native album access | **P3** | iOS Safari restrictions — Dan can't grant blanket Photos permission via web | Same as #17 — Capacitor only |

## Build plan — recommended order

### Phase A — UX flow parity (P0, ~2-3 sessions)
1. Build `composeStore.js` Zustand store with `media[], draft, visibility, location, aiLabel, coAuthors, groups, topics, shareToStory`
2. Build `AlbumPicker.jsx` (P0 #2): renders File[] from iOS native picker into 3-col grid with numbered selection + bottom thumb-strip + Next CTA
3. Build `CoverFramePicker.jsx` (P0 #3) wired to a new `social_posts.cover_frames TEXT[]` column. Extend transcode cron to emit 8 frames
4. Build `EditPostScreen.jsx` (P0 #1): the "New reel" screen with description, visibility, location, AI label, tag/collab, share-to-groups, add-topics, share-to-story, [Post now]
5. Wire `/hub/social-media` Photo/Video tap → push `compose` route → render the three screens in sequence
6. Verify ghost card + background upload still work across the route transitions

### Phase B — Backend feature parity (P1, ~3-4 sessions)
7. Add `social_posts` columns: `ai_label`, `cover_frames`, `audience_mode`, `audience_list_id`
8. New tables: `social_post_collaborators`, `social_post_topics`, `social_post_audience`
9. Extend `fn_create_social_post` RPC to accept all new fields and write related tables transactionally
10. Extend feed RLS / `/api/social/feed` to honor new audience modes
11. Build the 4 modal pickers for the edit screen: location, tag people, share to groups, add topics

### Phase C — Backend infra parity (P2, ~3-4 sessions)
12. Multi-resolution transcoding ladder in cron (extend `transcode-videos.js`)
13. DASH manifest generation
14. Switch feed video player to dash.js / hls.js
15. ACRCloud (or Pex) integration for copyright detection
16. UI badges + mute behavior for copyright-restricted posts

### Phase D — Native parity (P3, deferred)
17. Capacitor wrapper for iOS app shell
18. NSURLSession background upload bridge
19. PHPickerViewController bridge for native album grid

## Dependencies + risks

- **Capacitor wrapping (P3)**: requires App Store account, ~2 weeks of native dev to ship. Worth it once web parity is solid.
- **DASH/HLS playback**: hls.js bundle is ~150 KB gzipped. Acceptable.
- **Multi-resolution transcoding**: Vercel function timeout is 300s on Pro. A 1-min HEVC clip running 5-resolution ladder = ~4-5 min. Need to move transcoding to a dedicated Hetzner worker (the platform plan in `CLUB-ARENA-OFFICIAL-UPGRADE-INTEGRATION.md` already targets this).
- **Copyright detection**: ACRCloud is paid (~$0.005/scan). Pex is enterprise. Could build a free fingerprint-based MVP using `ffmpeg -ss 0 -t 30 -map 0:a -ar 8000 -ac 1 -f wav -` + open-source `Chromaprint` for audio fingerprinting against an internal database, but no copyright-holder license registry exists for us.
- **AI label policy**: legally defined in some regions (EU, possibly US). Implementing the toggle is trivial; ensuring it's actually applied to AI-generated content is a separate ML detection problem that we can't solve cheaply. Recommend: ship the toggle now, tag user-disclosed content; add ML detection later.

## Out-of-scope explicitly

- Reels-style infinite vertical scroll (separate feature, exists at `/hub/reels`)
- Live broadcast (`GoLiveModal` exists; not part of upload flow)
- Story expiry (handled by separate `fn_create_story`)
- Cross-post to Instagram (no Meta business relationship)

## Quick wins to ship first

If Dan wants a visible improvement this session, ship in this order:

1. **AlbumPicker + Multi-screen flow scaffold** — the picker → edit → post route transitions. Reuses existing TUS upload + RPC. 1 session.
2. **CoverFramePicker** — extend transcode cron to extract 8 frames; build the scrubber UI. 1 session.
3. **AI label toggle + Audience visibility presets** — column + UI. ½ session.

That gets us 80% of what the user sees in FB's flow. The remaining 20% (multi-res transcoding, copyright, native upload) is invisible to Dan unless he's directly looking for it.
