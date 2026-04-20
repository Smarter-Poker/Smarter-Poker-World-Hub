# PHASE 40 HAND-OFF v3 — Home Games 4-Pass Audit

**Last updated:** Monday, April 20, 2026
**Supersedes:** v2 (which had stale SHAs and an inaccurate deploy history)
**Read first. Then execute.**

---

## 0. TOOL + CREDENTIAL GATE (HARD — do not skip)

Run these checks **in order**. Print `PASS` or `FAIL` for each with the actual tool response. If **any** fails, **stop** and tell Dan. No workarounds, no silent compensations.

### GitHub access (PAT-based, not connector)

This project does **not** use a `github:*` MCP connector. It uses a GitHub Personal Access Token hitting `api.github.com` directly from `bash_tool`. The PAT is classic-format (`ghp_...`). Dan rotates the PAT between sessions — **request a fresh one if any auth check fails; do not retry with the old one**.

```
CHECK 1 — GitHub read (list last 5 commits on main):
  curl -H "Authorization: Bearer $GH_PAT" \
    "https://api.github.com/repos/Smarter-Poker/Smarter-Poker-World-Hub/commits?sha=main&per_page=5"
  Expect: JSON array of commit objects. Not a {"message": "Bad credentials"} object.

CHECK 2 — GitHub content read (README.md):
  GET /repos/Smarter-Poker/Smarter-Poker-World-Hub/contents/README.md
  Expect: 200 with base64 `content` field.

CHECK 3 — Bash + toolchain versions:
  echo "ok" && git --version && node --version && npm --version && curl --version | head -1
  Expect: git ≥2.x, node ≥18, npm ≥9, curl ≥7.

CHECK 4 — create_file smoke test:
  Create /home/claude/smoketest.txt containing "ok".
  Expect: view returns "ok".

CHECK 5 — str_replace smoke test:
  str_replace "ok" → "pass" on /home/claude/smoketest.txt.
  Expect: view returns "pass".

CHECK 6 — Supabase read (via tool_search first to load deferred tools):
  tool_search("supabase execute sql apply migration")
  Supabase:execute_sql on project kuklfnapbkmacvwxktbh:
    SELECT COUNT(*)::int FROM commander_home_groups;
  Expect: small int (currently 2 in prod; will drift).

CHECK 7 — Supabase:apply_migration available:
  Confirm the tool appears in your inventory after tool_search. Do NOT call it.

CHECK 8 — Vercel list deployments:
  tool_search("vercel list deployments")
  Vercel:list_deployments on
    projectId=prj_op66GkZyZcygXQKm76iyycfVFAQx
    teamId=team_SVD8r7AOPH065G3usBxVvrBc
  Expect: recent deployments, most recent one matching the current HEAD SHA.

CHECK 9 — Vercel build logs on most recent deploy:
  Vercel:get_deployment_build_logs on that deployment.
  Expect: healthy build stream. If state=ERROR on HEAD → stop and tell Dan.

CHECK 10 — Production site fetch:
  web_fetch https://smarter.poker/
  Expect: HTML 200 containing "Smarter.Poker" title.

CHECK 11 — Write-loop rehearsal (GitHub Trees API):
  Do NOT actually push. Just verify the surface exists by calling
    GET /repos/Smarter-Poker/Smarter-Poker-World-Hub/git/ref/heads/main
  Expect: object with `.object.sha` matching the HEAD SHA from CHECK 1.
```

Only after **all 11 pass** → print `TOOL GATE PASSED` and proceed to Section 1.

---

## 1. PROJECT IDENTITY

| Thing | Value |
|---|---|
| GitHub repo | `Smarter-Poker/Smarter-Poker-World-Hub` (branch `main`) |
| Production domain | `smarter.poker` |
| Vercel team ID | `team_SVD8r7AOPH065G3usBxVvrBc` |
| Vercel project ID | `prj_op66GkZyZcygXQKm76iyycfVFAQx` (`hub-vanguard`) |
| Supabase project ID | `kuklfnapbkmacvwxktbh` |
| PostHog project | `361383` |
| Safe-push script | `bash scripts/git-safe-push.sh` (runs `npm run build` + `npm run lint` + `scripts/verify-npm-versions.js` pre-push) |
| Sandbox | `/home/claude` — git, node 22, npm 10, python 3, curl 8, psql. Full network egress. **Filesystem resets between sessions.** |

**Credential handling:** PAT is pasted into chat per-session by Dan. Treat it as live-rotated. Never echo it to stdout or commit-message bodies; use `export GH_PAT=...` then `"Authorization: Bearer $GH_PAT"`. If any auth check returns 401/403, **stop and ask Dan for a fresh PAT** — do not retry.

---

## 2. ACTUAL CURRENT STATE (audited 2026-04-20 ~06:30 UTC)

### What's really on main (the previous handoff had this wrong)

The v2 handoff claimed HEAD was `3907e1c` and that it shipped. Neither is true. Confirmed via the GitHub Commits API + Vercel deploy list:

| SHA | Msg | Vercel state |
|---|---|---|
| `c995d5c` | fix(deploy-monitor): adversarial sweep - circuit breaker bypass | **QUEUED** |
| `05818da` | fix(poker-near-me): 4-pass adversarial sweep - debounce realtime bus emits | QUEUED |
| `8bace0f` | fix(deploy-monitor): remove block-scoped reference error | BUILDING |
| `040dff1` | fix(deploy-monitor): repair silent alert failures | QUEUED |
| `1ee1aa7` | 4-pass audit Pass 2: SOCIAL_FOLLOW_CHANGED EventBus on tour detail | **READY** (last shipped-live) |
| `76bebe0` | 4-pass audit Pass 2-4: empty stop_name leak fix | READY |
| `3907e1c` | fix(poker-near-me): safeguard feed reducers + EventBus→Postgres | **CANCELED** — never shipped |
| `28f0098` | 4-pass audit: follow state override, req ReferenceError, All Stops | CANCELED |
| `a813fb6` | chore: retrigger deploy for 16a01190 | READY |
| `16a0119` | phase40: add roster page, broadcast API, roster link | CANCELED |

**Interpretation:** The phase40 frontend (click-to-DM, roster page, broadcast API, late-RSVP-to-DM, inbox fallback waterfall) is live in production — but it was shipped by the `2b4b36e0` / `a813fb60` chain, **not** by `3907e1c` or the `phase40: ...` commits that the v2 handoff listed. The listed SHAs tell you what was *authored*, not what *shipped*.

**Home-games-relevant live production routes are all present and serving traffic.** Confirm by hitting the endpoints listed in Section 3 before starting the audit.

### DB state

- 25 home-games + messaging tables; **all RLS-on**.
- 2 tables have RLS on but 0 policies — access will always fail; verify these are internal write-only (`commander_home_group_share_log`, `commander_home_group_view_log`, `commander_home_join_attempts`). This may be intentional (DEFINER function writes only) but **Pass 3 must prove this**.
- 120+ RPCs under `public.*` related to home-games. Inventory cached in Section 3.
- `social_messages` has **5 RLS policies**, confirming the known v2 backlog bug #56 (duplicate INSERT policies with differing strictness).

---

## 3. COMPLETE SURFACE MAP (the audit target)

### 3.1 Pages (`pages/`)

```
pages/hub/commander/home-games/index.js               # list / discover
pages/hub/commander/home-games/create.js              # new group / game wizard
pages/hub/commander/home-games/[id].js                # group detail
pages/hub/commander/home-games/[id]/manage.js         # host settings
pages/hub/commander/home-games/[id]/roster.js         # roster + DM + broadcast
pages/hub/home-games/[slug].js                        # public group page
pages/home-game/[code].js                             # public invite landing
```

### 3.2 API routes (`pages/api/`)

```
# Authenticated commander surface
pages/api/commander/home-games/discover.js
pages/api/commander/home-games/matchmaker.js
pages/api/commander/home-games/join/[code].js
pages/api/commander/home-games/rsvps/[id].js
pages/api/commander/home-games/groups/index.js
pages/api/commander/home-games/groups/[id].js
pages/api/commander/home-games/groups/[id]/members.js
pages/api/commander/home-games/groups/[id]/subscribe.js
pages/api/commander/home-games/groups/[id]/announcements.js
pages/api/commander/home-games/groups/[id]/posts.js              # NB: under [id]/ not groups/
pages/api/commander/home-games/groups/[id]/roster.js             # ★ NEW — calls get_home_group_roster
pages/api/commander/home-games/groups/[id]/broadcast.js          # ★ NEW — calls broadcast_to_home_group_roster
pages/api/commander/home-games/groups/[id]/dm-player.js          # ★ NEW — calls start_home_game_player_dm
pages/api/commander/home-games/events/index.js
pages/api/commander/home-games/events/[id].js
pages/api/commander/home-games/events/[id]/rsvp.js
pages/api/commander/home-games/events/[id]/reviews.js
pages/api/commander/home-games/[id]/posts.js

# Public surface (unauthenticated — extra scrutiny)
pages/api/public/home-game/[code].js                               # invite landing
pages/api/public/home-games/[slug]/events/[eventId]/request-seat.js

# Messenger surface (audit these for the inbox RPC-first-fallback-waterfall risk)
pages/api/messenger/get-conversations.js                           # ★ HIGHEST RISK — has fallback waterfall
pages/api/messenger/get-messages.js
pages/api/messenger/send-message.js
pages/api/messenger/edit-message.js
pages/api/messenger/delete-conversation.js
pages/api/messenger/mark-read.js
pages/api/messenger/broadcast-message.js
pages/api/messenger/insert-missed-call-notification.js
pages/api/messenger/gif-search.js
pages/api/messenger/link-preview.js
pages/api/messenger/global-search.js
```

`★ NEW` = added in the phase40 frontend wiring push; these haven't been security-audited yet.

### 3.3 Supporting libs

```
src/lib/commander/pushNotifications.js      # home-games push fan-out
src/lib/emailTemplates.js                   # home-games email templates
src/lib/authUtils.js                        # getAccessToken()
```

### 3.4 Components (JSX)

```
src/components/poker-near-me/CreateHomeGame.jsx
src/components/poker-near-me/lobby/PodHomeGames.jsx
src/components/poker-near-me/lobby/LobbyOverlay.jsx
src/components/poker-near-me/InteractiveTutorial.jsx
```

Note: most home-games UI lives inline in the pages above. There may be additional JS components under `src/components/commander/` — the new session must map them in Pass 1.

### 3.5 DB tables (all RLS-on)

```
commander_home_audit_log              policies=1  triggers=0
commander_home_content_reports        policies=2  triggers=0
commander_home_game_photos            policies=4  triggers=1
commander_home_game_reviews           policies=4  triggers=2
commander_home_game_templates         policies=4  triggers=0
commander_home_games                  policies=4  triggers=6
commander_home_group_follows          policies=4  triggers=0
commander_home_group_promotion_requests  policies=2  triggers=0
commander_home_group_share_log        policies=0  triggers=0   ← verify by design
commander_home_group_view_log         policies=0  triggers=0   ← verify by design
commander_home_group_weekly_snapshots policies=1  triggers=0
commander_home_groups                 policies=4  triggers=12
commander_home_invite_tokens          policies=1  triggers=1
commander_home_join_attempts          policies=0  triggers=0   ← verify by design
commander_home_members                policies=5  triggers=13
commander_home_poll_votes             policies=4  triggers=1
commander_home_polls                  policies=3  triggers=2
commander_home_post_comments          policies=4  triggers=4
commander_home_post_likes             policies=3  triggers=3
commander_home_posts                  policies=4  triggers=5
commander_home_rsvps                  policies=4  triggers=9
commander_home_seats                  policies=4  triggers=1
social_conversation_participants      policies=2  triggers=0
social_conversations                  policies=2  triggers=0
social_messages                       policies=5  triggers=1   ← bug #56 here
```

### 3.6 DB RPCs (categorized)

**Phase 40 frontend-facing (the newest surface — LIVE, UNAUDITED):**
- `start_home_game_player_dm(game_id, from, to, initial_msg)`
- `start_home_group_roster_dm(group_id, from, to, initial_msg)`
- `get_home_group_roster(group_id, caller)`
- `broadcast_to_home_group_roster(group_id, caller, title, body, include_members, include_followers, link_path)`
- `fn_get_conversations(user_id)` / `fn_get_user_conversations(user_id)` (auth-gated; AUTH_MISMATCH if caller ≠ user)

**Lifecycle (game state transitions):**
- `cancel_home_game`, `complete_home_game`, `close_home_game_rsvps`, `edit_home_game`, `clone_home_game`, `create_home_game_from_template`, `create_home_game_template`, `fn_home_game_auto_complete` (trigger), `fn_generate_recurring_home_games` (cron), `fn_cleanup_stale_scheduled_home_games`

**Seats:**
- `assign_home_game_seat`, `claim_home_game_seat`, `release_own_home_game_seat`, `fn_home_assign_seat`, `fn_home_vacate_seat`, `fn_home_move_seat`, `fn_home_set_seat_status`, `fn_home_randomize_seats`, `fn_home_init_seats`, `fn_home_list_seats`, `mark_home_game_seat_away`, `get_home_game_seat_map`, `fn_block_direct_home_seat_update` (trigger), `promote_home_game_waitlist`

**RSVP:**
- `rsvp_to_home_game(p_game_id, p_response, p_caller, p_bringing_guests, p_message)`, `checkin_to_home_game`, `fn_notify_home_rsvp` (trigger), `fn_home_rsvps_bump_activity` (trigger), `update_home_game_rsvp_counts` (trigger)

**Groups + membership:**
- `join_home_group`, `leave_home_group`, `manage_home_group_member`, `toggle_home_group_follow`, `edit_home_group`, `transfer_home_group_ownership`, `request_home_group_promotion`, `withdraw_home_group_promotion`, `revive_home_group`, `reset_home_member_strikes`, `set_home_member_private_note`, `set_home_member_regular`, `export_home_group_members_csv`, `fn_home_is_approved_member`, `fn_home_is_group_staff`, `fn_home_caller_is_game_staff`, `protect_home_group_owner_id` (trigger), `protect_home_group_owner_membership` (trigger), `fn_block_home_member_ban_evasion` (trigger), `update_home_group_member_count` (trigger)

**Invites + tokens:**
- `create_home_group_invite_token`, `redeem_home_group_invite_token`, `track_home_group_share_click`, `fn_cleanup_home_join_attempts`

**Posts / comments / likes / polls:**
- `create_home_group_post`, `edit_home_group_post`, `delete_home_group_post`, `create_home_post_comment`, `toggle_home_post_like`, `create_home_group_poll`, `vote_home_group_poll`, 5x `fn_enforce_home_*_field_permissions` (triggers), `fn_update_home_post_*_count` (triggers), `fn_notify_home_post_*` (triggers)

**Discovery / search / recommendations:**
- `search_home_groups`, `search_home_groups_v2`, `get_trending_home_groups`, `get_recommended_home_groups`, `get_my_home_groups`, `get_my_followed_home_groups`, `get_home_groups_facets`, `get_home_group_public_detail`, `get_home_group_visibility_status`, `fn_refresh_trending_home_groups` (cron), `fn_home_group_stale_sweep`

**Feed + detail:**
- `get_home_group_feed`, `get_home_group_analytics`, `get_home_group_member_engagement`, `get_home_group_weekly_trends`, `get_home_group_unread_count`, `mark_home_group_posts_read`, `get_friends_home_activity`, `get_user_home_games_calendar`, `get_live_home_game_state`

**Moderation + abuse:**
- `report_home_content`, `detect_home_abuse_patterns`, `fn_check_home_rate_limit`, `mark_all_home_notifications_read`, `fn_notify_home_member_status` (trigger), `fn_notify_friends_of_home_join` (trigger), `fn_notify_home_game_created` (trigger), `fn_notify_home_game_cancelled` (trigger), `fn_emit_home_notification`

**Geo + sync:**
- `autogeocode_home_group` (trigger), `fn_home_group_refresh_geog` (trigger), `fn_home_group_refresh_search_vector` (trigger), `fn_home_group_sync_venue`, `fn_trg_home_group_sync_venue` (trigger), `fn_ensure_social_page_for_home_group`, `autocreate_home_group_social_page` (trigger), `sync_home_group_to_social_page` (trigger), `link_home_game_to_social_page` (trigger), `validate_home_game_social_page_link` (trigger), `fn_social_page_posts_bump_home_group` (trigger), `fn_social_page_reviews_bump_home_group` (trigger)

**Photos + reviews + reminders:**
- `record_home_game_photo`, `fn_home_game_reviews_bump_activity` (trigger), `fn_send_home_game_reminders` (cron), `fn_home_host_pending_nudge` (cron), `fn_home_game_recap_prompt` (cron)

**Messaging glue (for home-games context):**
- `fn_get_conversations`, `fn_get_user_conversations`, `fn_get_or_create_conversation`, `fn_create_home_group_conversation` (trigger on group create), `fn_add_member_to_group_conversation` (trigger on member add), `fn_remove_member_from_group_conversation` (trigger on leave), `fn_update_conversation_last_message` (trigger on message), `start_home_game_player_dm`, `start_home_group_roster_dm`

**Health + verification:**
- `verify_home_games_health`, `verify_home_group_owner_consistency`, `compute_home_group_quality_score`, `fn_refresh_all_home_group_quality_scores` (cron), `fn_capture_home_weekly_snapshots` (cron), `increment_home_game_stats`, `fn_bump_home_group_activity`, `fn_home_members_bump_activity` (trigger), `fn_home_group_self_activity_bump` (trigger), `trg_fn_home_post_bump_activity` (trigger)

**iCal + slugs:**
- `generate_home_group_ical`, `slugify_home_game`, `unique_home_game_slug`, `enforce_home_group_logo_on_insert` (trigger)

### 3.7 EventBus topics (home-games-relevant)

Known topics from prior sessions (Pass 1 must verify via grep):
- `GAME_STARTED` — fired when host starts a game; listeners include the player detail page (late-RSVP→DM handoff).
- `SOCIAL_FOLLOW_CHANGED` — cross-tab follow sync (recently fixed on tour detail; verify home-group-follow path too).
- `HOME_GAME_RSVP_CHANGED`, `HOME_GROUP_MEMBER_CHANGED`, `HOME_POST_CREATED` — candidate names; **confirm by grep `EventBus.emit` and `EventBus.on` in repo before Pass 1**.
- Supabase realtime channels: `commander_home_games:*`, `commander_home_rsvps:*`, `commander_home_seats:*`, `social_messages:conversation_id=eq.*`. Subscription cleanup is Pass 4 concern (zombie subscriptions).

---

## 4. THE MISSION — MAXIMUM RIGOR AUDIT (4-PASS)

### Operating rules (from Dan, verbatim)

> No rubber-stamping. No "looks good" until verified. Fix every bug found, push to git, test on smarter.poker only.
>
> **Pass 1 — Wiring:** Map every component, handler, subscription, Supabase query, endpoint, and BUS event. Verify all connections are bidirectional and complete. Fix gaps.
>
> **Pass 2 — Real-Time:** Trace 5 scenarios end-to-end: input → event → bus → Supabase → subscription → UI refresh. Verify instant saves, error/retry handling, no stale data, cross-tab propagation. Fix silent failures.
>
> **Pass 3 — Adversarial:** As a malicious insider, find every vector for: data loss, RLS bypass, zombie subscriptions, memory leaks, stale UI, saves that look successful but aren't. Verify each is blocked. Fix unblocked vectors.
>
> **Pass 4 — Edge Cases:** Torture test: null/empty/max values, offline/reconnect, rapid actions, concurrent mutations, tab close/reopen. Check for unnecessary re-renders, duplicate subscriptions, unhandled rejections. Optimize only after correctness is locked.
>
> **Loop rule:** If any pass finds a new issue → fix it in code → restart from Pass 1. Output only after 4 consecutive clean passes.
>
> **After fixing:** Commit, push to git, verify on smarter.poker. Report ONLY new bugs found this sweep (not prior sweeps).

### 4.1 Scope — what counts as "home games implementations"

**In scope (all of Section 3):**
- All 7 pages + all 17 API routes + all 4 JSX components + the public invite surface + the push notification lib + the email templates.
- All 25 DB tables + all 120+ RPCs listed.
- The messenger surface, **but only the 2 conversation-listing endpoints** (`get-conversations.js`, `get-messages.js`) and their RPCs (`fn_get_conversations`, `fn_get_user_conversations`, `fn_get_or_create_conversation`, `fn_create_home_group_conversation` triggers, `fn_add/remove_member_from_group_conversation` triggers) — because home-games DM flows depend on them.
- All 5 policies on `social_messages` and the 2 policies on each of the `social_conversation*` tables.

**Out of scope (do not touch):**
- Club Commander desktop app.
- Club Arena (Vite SPA and its migration files).
- Tournament / leaderboard code.
- Auth code (login/signup/OAuth).
- `database/migrations/**` and `supabase/**` directories — use `Supabase:apply_migration` for DB changes.
- The rest of the messenger surface beyond conversation-listing.

### 4.2 Pass 1 — Wiring checklist

For every page in 3.1 and every API route in 3.2:
1. List all imports. Resolve every one that references a home-games lib, helper, or RPC wrapper.
2. For each handler (onSubmit, onClick, useEffect, etc.), trace the data path: **UI event → handler → API route → RPC → table write/read → response → state update → re-render**. Draw or write this trace inline per handler.
3. For each Supabase subscription (`.channel(...).on('postgres_changes', ...)`), confirm:
   - The channel name is unique per mount (no cross-component key collisions).
   - There is a `removeChannel` in the cleanup of the corresponding `useEffect`.
   - The filter matches the intended scope (not e.g. `*` when it should be `eq.${id}`).
4. For each `EventBus.emit`, find the matching `EventBus.on`. For each `EventBus.on`, find the matching emit. **Any emit with no listener OR listener with no emit is a bug — file and fix.**
5. For each DB RPC invocation, confirm the caller passes the **real authenticated user** (from session) as `p_caller_user_id`, never a user ID from the request body.

**Pass 1 output:** a component-by-component wiring table. Gaps found → fix → restart Pass 1.

### 4.3 Pass 2 — Real-Time end-to-end traces

Run these 5 scenarios live on `smarter.poker` with a test account. For each, trace the full pipeline from keystroke to cross-tab UI refresh.

1. **Host creates game → player RSVPs → host sees RSVP instantly.**
   Trace: client form → `POST /api/commander/home-games/events/[id]/rsvp` → `rsvp_to_home_game` RPC → `commander_home_rsvps` INSERT → `fn_notify_home_rsvp` trigger → `notifications` INSERT → realtime broadcast → host's subscribed channel → `EventBus.emit('HOME_GAME_RSVP_CHANGED')` → host roster + event detail re-render.
2. **Player misses cutoff, late-RSVPs on a started game → redirected to DM with host.**
   Trace: RSVP handler detects `GAME_STARTED` event state → calls `start_home_game_player_dm` → `social_conversations` + `social_messages` upserts → navigates to `/hub/messenger/[conversationId]`.
3. **Host clicks "Message" on a roster row → DM opens with the player (member OR follower).**
   Trace: roster page → dm-player API route → `start_home_game_player_dm` or `start_home_group_roster_dm` → conversation+initial message inserted → navigate.
4. **Host broadcasts to followers only → opted-in follower's unread notification increments; opted-out follower's does not.**
   Trace: broadcast API route → `broadcast_to_home_group_roster` with `include_members=false, include_followers=true` → filters on member opt-in prefs → `notifications` INSERT for each receiver → realtime fan-out → follower's notification bell updates.
5. **Inbox load under AUTH_MISMATCH.**
   Trace: `/hub/messenger` mounts → `GET /api/messenger/get-conversations` → `fn_get_user_conversations(p_user_id)` — but `p_user_id` is somehow wrong (simulate by tampering with the request body). RPC raises `AUTH_MISMATCH`. **Verify the fallback waterfall in get-conversations.js does not silently succeed.**

**For each trace, verify:**
- Instant save (no double-click required, no "loading..." longer than 200 ms for the happy path).
- Error + retry: cut network mid-save, confirm user sees a retryable error, not a silent failure.
- No stale data on re-mount (SWR/React Query keys invalidated).
- Cross-tab: open two tabs as the same user, do the action in one, confirm the other updates via realtime within ~1 s.

Silent failures → fix → restart from Pass 1.

### 4.4 Pass 3 — Adversarial (malicious insider)

For each RPC in 3.6, and each page+API route in 3.1/3.2, find the vector. Then verify it's blocked. Minimum attack surface to cover:

**Identity forgery:**
- In every RPC that takes `p_caller_user_id`, can the client pass a user ID that isn't their own? Every API route must pass `auth.uid()` from the verified session, never a body field. Any route trusting the body is a CRITICAL bug.
- `social_messages` INSERT: known bug #56 (duplicate policies, lax one wins — sender_id forgery). Verify fix applied. If not, apply.
- `social_messages` UPDATE: known bug #57 (no WITH CHECK; sender can move messages across conversations). Verify.
- `social_conversation_participants` INSERT: known bug #58 (unaudited — can a random user insert themselves into an existing conversation?). Probe and harden.

**Direct-table writes bypassing RPCs:**
- `commander_home_seats` direct UPDATE: known bug #50, migration `phase40_protect_home_seats_direct_update` applied but verification test needs rerun with temp-table + authenticated GRANTs. Confirm block is active.
- All other home-games tables: for each policy in 3.5, probe with direct PostgREST write as a non-member/non-staff user. Confirm denial.

**Moderation-bypass & data integrity:**
- `report_home_content` status CHECK constraint: known bug #51 (test used `status='resolved'` but constraint rejects that). Inspect via `SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname='commander_home_content_reports' AND c.conname LIKE '%status%';` — valid values likely `open|reviewed|actioned|closed`. Update adversarial test vectors (bogus_target, self_report, legit_report, dup_while_pending, rereport_after_resolve) and rerun.
- URL injection in post/group photo URL columns: `commander_home_posts.image_urls` (array), `commander_home_posts.video_url`, `commander_home_groups.cover_photo_url` / `profile_photo_url`, `commander_home_games.cover_photo_url`, `profiles.avatar_url`. Add a BEFORE INSERT/UPDATE trigger rejecting `javascript:`, `data:`, `file:`, and private-IP-range hosts (SSRF). Verify.

**Storage bucket RLS:**
- `commander_home_game_photos` and any other home-games-linked buckets. Uploads must require group membership; reads must honor group privacy + membership; deletes only by uploader OR staff.

**RSVP time-window manipulation:**
- Late-RSVP path `v_game_start_ts <= NOW()` is solid. But probe:
  - Tournament registration windows: `registration_opens_at`, `registration_closes_at` (confirm columns exist; field names may differ — check first).
  - Can a player RSVP after close by forging timestamps client-side? (Should be impossible — all time checks must be server-side.)

**Zombie subscriptions:**
- Navigate between home-games pages rapidly. Does each page clean up its channels on unmount? Open browser devtools → Network → WS → count active channels. If it grows unbounded, that's a memory leak + data leak risk.

**Saves that look successful but aren't:**
- Every `.insert().then()` / `.update().then()` pattern without an error branch is a candidate. `pages/api/messenger/get-conversations.js` RPC-first-fallback-waterfall is the highest-risk file for this — if RPC throws AUTH_MISMATCH does the fallback silently return other users' data?

Unblocked vectors → fix → restart from Pass 1.

### 4.5 Pass 4 — Edge cases

**Input torture:**
- Null, empty string, single space, all-whitespace, unicode zalgo, `<script>`, SQL quotes, max-length (4000 char post, 100-element image_urls array), negative integers, 0, `Infinity`, `NaN`, wrong types (object where string expected).
- For every required prop, try omitting it.

**Network:**
- Airplane mode mid-action → reconnect. Does the save complete? Does the UI show a retry? Is data corrupted?
- Tab close during save. Did the write commit or roll back?
- Two tabs same user, simultaneous conflicting action (e.g., RSVP yes in tab A, RSVP no in tab B, same millisecond). Last-write-wins? Or error?
- Slow 3G: 2 s latency per request. Does the UI double-submit? Dedupe?

**Rapid actions:**
- Click "RSVP" 10 times in 500 ms. Does the RPC idempotency hold? Do you see 10 DB rows or 1?
- Follow/unfollow a group 20 times in 5 s. Is the final state correct?
- Spam-send DMs (200 in 30 s). Rate limiter (`fn_check_home_rate_limit`) should kick in — verify error bubbles to UI.

**Lifecycle:**
- Tab close and reopen mid-flow. Is draft state preserved if intended, lost if not intended?
- Browser back button after a nav. Is the subscription cleaned up?
- Long-running session (leave a page open 24 h). Does the Supabase JWT refresh correctly?

**Render hygiene:**
- React DevTools Profiler. Are there unnecessary re-renders? (e.g., a parent re-rendering a child when only parent's unrelated state changed.)
- Duplicate subscriptions: `grep -r '\.channel(' src/ pages/` — any channel name used by two components that mount together is a duplicate.
- Unhandled promise rejections in the console.

**Optimize only after correctness.** Don't touch perf until all 4 passes are clean.

### 4.6 Loop discipline

A new bug found in Pass N → fix it → **start over from Pass 1**, not resume from Pass N. The final report is only emitted after **4 consecutive clean passes with no new bugs found**.

---

## 5. KNOWN BACKLOG CARRIED FROM v2 (do NOT treat as solved)

These were partially addressed in the previous session. The current session must verify, finalize, and land fixes. Numbering kept for continuity.

### Bug #50 — Seat direct-UPDATE block — **re-verify**
Migration `phase40_protect_home_seats_direct_update` applied and in production. Verification test harness hit a GRANT issue. Rerun with:
```sql
DROP TABLE IF EXISTS _t;
CREATE TEMP TABLE _t (...);
GRANT INSERT,SELECT ON _t TO authenticated;
GRANT USAGE,SELECT ON SEQUENCE _t_id_seq TO authenticated;
-- SET LOCAL ROLE authenticated and test direct UPDATE on commander_home_seats
```

### Bug #51 — `report_home_content` adversarial test — **finalize**
Status CHECK constraint rejects `status='resolved'`. Inspect:
```sql
SELECT pg_get_constraintdef(c.oid)
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
WHERE t.relname='commander_home_content_reports' AND c.conname LIKE '%status%';
```
Likely enum: `open | reviewed | actioned | closed`. Update test vector T5 and rerun all 5: `bogus_target`, `self_report`, `legit_report`, `dup_while_pending`, `rereport_after_resolve`.

### Bug #56 — `social_messages` duplicate INSERT policies
Two INSERT policies: strict (`sender_id = auth.uid() AND participant`) vs lax (`participant` only). Postgres OR-combines → lax wins → sender_id forgery.
Fix:
```sql
DROP POLICY "Users can send messages to their conversations" ON social_messages;
-- keep the strict policy
```

### Bug #57 — `social_messages` UPDATE missing WITH CHECK
Sender can move messages across conversations. Fix: add `WITH CHECK` matching the USING clause + lock `conversation_id` via a field-permission trigger.

### Bug #58 — `social_conversation_participants` self-insert
Unaudited. Probe: can a random authenticated user `INSERT INTO social_conversation_participants (conversation_id, user_id) VALUES ('<any-existing-convo-id>', auth.uid())`? If yes → they can read someone else's conversation. Harden with a policy requiring group membership or existing participant status.

### URL validation trigger (SSRF / XSS prevention)
Add BEFORE INSERT/UPDATE trigger on:
- `commander_home_posts.image_urls` (text[]) — iterate array
- `commander_home_posts.video_url`
- `commander_home_groups.cover_photo_url`, `profile_photo_url`
- `commander_home_games.cover_photo_url`
- `profiles.avatar_url`

Reject: `javascript:`, `data:`, `file:`, `about:`, hostnames resolving to `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `::1`, `fe80::/10`. Only allow `http://` + `https://` with a public-IP host.

### Storage bucket RLS
Buckets: `commander_home_game_photos` + any others tied to home-games. For each: upload → group membership required; read → group privacy + membership required; delete → uploader OR staff only. Test each with RLS-bypass probes.

### RSVP time-window edge cases
Confirm actual column names (`registration_opens_at`, `registration_closes_at` may be on `commander_home_games` or a related events table). Cross-check against the frontend close-RSVP flow. Time checks must be `NOW() AT TIME ZONE 'UTC'` server-side, never trust client timestamps.

---

## 6. PRODUCT-DECISION GATES — STOP AND ASK DAN

These are not bugs; they are unclear product decisions. Do not build until Dan decides.

### Host walk-in RPC
Gap: walk-ins can't be checked in because `checkin_to_home_game` requires existing RSVP and `rsvp_to_home_game` enforces `auth.uid() = p_caller`. Walk-in = player at the physical table without a prior RSVP.
Options: (a) new `host_add_walkin_rsvp(p_game_id, p_player_display_name, p_caller)` that accepts a non-user walk-in name; (b) require host to create a guest-profile first; (c) out of scope.
Ask Dan before building.

### Follow-then-privatize
Followers persist when a public group flips private. Options: (a) purge followers on privatize; (b) suppress notifications to followers but keep them in the list; (c) leave alone (current). Ask Dan.

---

## 7. HARD RULES

### Always respect
- **Home games are NOT a money intermediary.** `buy_in` fields are informational display only. Do not build anything touching real money flow for home games. Club Commander is a separate B2B SaaS and is out of scope here.
- **Migration law.** Read these files in the repo root; do not modify them: `MIGRATION-LAW.md`, `MASTER-MIGRATION-DOCUMENT.md`, `STEP1-REMOVAL-CATALOG.md`, `MIGRATION-CHANGELOG.md`, `BIBLE-V8-REFERENCE.md`.
- **Commit discipline.** One logical change = one commit. Prefix with `phase40:`. For DB-only changes use Supabase:apply_migration with a descriptive snake_case name. Frontend pushes go through `bash scripts/git-safe-push.sh` which runs `npm run build` + `npm run lint` + `scripts/verify-npm-versions.js` pre-push.
- **Never trust the request body for identity.** Always use the authenticated session's user ID as `p_caller_user_id`.
- **Report only NEW bugs per sweep.** Don't re-list fixes from prior sweeps in the final output.

### Out of scope — do not touch
- `database/migrations/**`, `supabase/**` (use Supabase MCP for DB work)
- Auth code
- Club Commander desktop app
- Tournament / leaderboard code
- Club Arena migration files
- Messenger routes beyond conversation-listing

### Red flags — stop and ask Dan
- Anything implying home games handle real money
- An RLS policy change that would broaden access (even by a hair)
- Pre-flight check failure in `git-safe-push.sh`
- Vercel build failing on a commit you pushed
- A migration file you wrote conflicts with live DB state
- A new environment variable would be required
- Anything that touches `auth.users`, `auth.sessions`, or OAuth provider config

---

## 8. REPORTING FORMAT (Dan's template — use exactly)

After 4 consecutive clean passes:

```markdown
## AUDIT RESULTS — [Component Name]

### Status: [BUG-FREE ✅ | BUGS FOUND ❌]

### New Bugs Found This Sweep: [count]

| # | Bug | Severity | File | Fix Applied |
|---|-----|----------|------|-------------|
| 1 | [description] | [Critical/High/Medium/Low] | [filename:line] | [what was changed] |

### Passes Completed: [number] consecutive clean passes

### Files Modified:
- [file1.jsx] — [what changed]
- [file2.js] — [what changed]

### Git: Committed and pushed — [commit hash]
### Live Verification: [PASS ✅ | FAIL ❌] on smarter.poker
```

One such block per component. At the end, a summary table across all components.

---

## 9. DAN — HOW TO WORK WITH HIM

- Terse, often single-word confirmations.
- Works solo, no team to defer to.
- **Zero tolerance** for stubs, mock data, "here's what you'd do" answers. Execute, don't explain.
- Pushes back hard on quality → better to stop and ask than bulk-rewrite.
- Respects: one task = one commit; prefix `phase40:`; `bash scripts/git-safe-push.sh`.
- Pursuing seed funding — stability > speed, correctness > optimization.
- PAT handling: pasted per-session. Rotate after every session. Request new PAT if auth fails; never retry.

---

## 10. TOOL-LEARNING ACCUMULATED

**Postgres / Supabase gotchas:**
- `auth.role()`, `auth.uid()`, `pg_trigger_depth()` work inside SECURITY DEFINER (they read JWT / txn state).
- `current_user` flips to function OWNER inside SECURITY DEFINER. Use SECURITY INVOKER if you need the caller's role.
- `now()` is stable within a transaction. Use `clock_timestamp()` if ordering matters inside tests.
- `#variable_conflict use_column` needed in `RETURNS TABLE` PL/pgSQL when column names collide with params.
- Test harness: `CREATE TEMP TABLE`, then `GRANT INSERT,SELECT ... TO authenticated` + `GRANT USAGE,SELECT ON SEQUENCE ... TO authenticated` when your DO block writes inside `SET LOCAL ROLE authenticated`.

**Vercel MCP:**
- `Vercel:get_project` / `get_deployment` need the full team ID.
- Runtime logs historically flaky for home-games routes. Build logs reliable.
- Vercel MCP is read-only for this team in your session (no rollback/promote). Rollback = push a revert commit.

**GitHub Trees API push workflow (since there's no GitHub MCP connector):**
```bash
export GH_PAT='ghp_...'  # pasted by Dan
REPO=Smarter-Poker/Smarter-Poker-World-Hub
# 1. Get HEAD SHA
HEAD=$(curl -sS -H "Authorization: Bearer $GH_PAT" \
  "https://api.github.com/repos/$REPO/git/ref/heads/main" | jq -r .object.sha)
# 2. Get base tree
BASE_TREE=$(curl -sS -H "Authorization: Bearer $GH_PAT" \
  "https://api.github.com/repos/$REPO/git/commits/$HEAD" | jq -r .tree.sha)
# 3. Create blob(s) for each new/changed file
BLOB=$(curl -sS -X POST -H "Authorization: Bearer $GH_PAT" \
  "https://api.github.com/repos/$REPO/git/blobs" \
  -d "{\"content\":\"$(base64 -w0 file)\",\"encoding\":\"base64\"}" | jq -r .sha)
# 4. Create a tree
TREE=$(curl -sS -X POST -H "Authorization: Bearer $GH_PAT" \
  "https://api.github.com/repos/$REPO/git/trees" \
  -d "{\"base_tree\":\"$BASE_TREE\",\"tree\":[{\"path\":\"PATH\",\"mode\":\"100644\",\"type\":\"blob\",\"sha\":\"$BLOB\"}]}" | jq -r .sha)
# 5. Create a commit
COMMIT=$(curl -sS -X POST -H "Authorization: Bearer $GH_PAT" \
  "https://api.github.com/repos/$REPO/git/commits" \
  -d "{\"message\":\"MSG\",\"tree\":\"$TREE\",\"parents\":[\"$HEAD\"]}" | jq -r .sha)
# 6. Fast-forward the ref
curl -sS -X PATCH -H "Authorization: Bearer $GH_PAT" \
  "https://api.github.com/repos/$REPO/git/refs/heads/main" \
  -d "{\"sha\":\"$COMMIT\",\"force\":false}"
```
For code changes that touch package.json, prefer cloning the repo so `scripts/git-safe-push.sh` can run its lint/build validation. For docs-only, the Trees API is fine.

---

## 11. TRANSCRIPTS AND DEEP CONTEXT

`/mnt/transcripts/` (if available in your sandbox):
- Primary: `2026-04-20-04-54-00-phase40-homegames-db-audit.txt` — 54 adversarial tests with SQLSTATE codes, full RLS catalog, FK topology, CHECK constraints, column lists.
- Chain: `journal.txt` — catalog of all prior transcripts.

If those files aren't present in your sandbox, work from Section 3 of this doc (the inventory) and do your own Pass 1 discovery.

---

## 12. KICK-OFF PROMPT FOR THE NEXT SESSION

Paste verbatim at the top of the next Claude chat:

> Phase 40 home-games 4-pass audit, session N+1.
>
> STEP 1 — Run Section 0 of `docs/phase40-handoff.md` (11-check tool+credential gate). If ANY check fails, STOP and tell me which one — do not work around it.
>
> STEP 2 — Print `TOOL GATE PASSED`.
>
> STEP 3 — Read the full `docs/phase40-handoff.md`. Then map Section 3 (the complete surface inventory) against what you see in the repo today; flag any new files not in the map.
>
> STEP 4 — Begin the 4-Pass Audit on home games per Section 4. Start with the highest-risk surface: `pages/api/messenger/get-conversations.js` (the RPC-first-fallback-waterfall) plus the three ★ NEW API routes. Then iterate outward.
>
> STEP 5 — Loop the 4 passes until 4 consecutive clean passes. After each commit, push via `bash scripts/git-safe-push.sh`. Report in Section 8 format.
>
> STEP 6 — Also address the v2 backlog (Section 5: bugs #50, #51, #56, #57, #58, URL validation, storage RLS, RSVP time-windows).
>
> STOP and ask me if you hit any red flag from Section 7.
>
> I'm terse and direct. Execute, don't explain.

---

**End hand-off v3. Go.**
