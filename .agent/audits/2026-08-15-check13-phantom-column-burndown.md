# CHECK 13 phantom-column burn-down — 187 → 0, gate flipped to blocking

Date: 2026-08-14 → 2026-08-15
Author: Cowork agent
Scope: World Hub repo (code + migrations + CI gate). Supabase project
kuklfnapbkmacvwxktbh.

## What this phase was

CHECK 13 (`scripts/ci/check-phantom-columns.mjs`) statically resolves every
`.from()` call chain against the live PostgREST schema document and reports
columns that do not exist. A phantom column is not a cosmetic problem: the
query 42703s, this repo's call sites almost universally swallow the error
into `console.warn`, and the feature silently never works — same failure
class as CHECK 11's phantom tables, invisible to the build.

The check shipped warn-only with a 187-finding backlog. This phase burned
the backlog to zero and removed `--warn-only`, making CHECK 13 a blocking
gate like CHECKs 11/12.

## Burn-down ledger (scanner-verified after every sweep)

| stage | findings | shipped as |
|---|---|---|
| baseline (first run) | 187 | — |
| money-path batch + batch 2 (chip escrow, rakeback, stripe, …) | 187 → 142 | earlier commits (see 2026-08-14 audits) |
| sweep 1 (training + GTO stack, 11 files) | 142 → 126 | fabec97fe4 |
| sweep 2 (club-arena + god-mode, 12 files) | 126 → 110 | fabec97fe4 |
| sweep 3 (content-engine + poker-engine, 20 files) | 110 → 73 | 0fca5d4bec |
| sweep 4 (this commit: 38 files + 1 deletion) | 73 → 0 | this commit |
| gate flip: `--warn-only` removed from CHECK 13 | — | this commit |

Final scan: **0 phantom, 0 stale allowlist entries, 2,764 call sites
checked** (local harness: PostgREST OpenAPI stub built from
information_schema — 760 tables / 9,063 columns + this phase's migrations).

## Sweep 4 — the fix taxonomy

Every finding got a *designed* fix — the intent of the code was mapped to
the real schema, never mechanically deleted. Categories:

### 1. Additive migration (feature persistence the schema never carried)
`supabase/migrations/20260815_check13_sweep4_columns.sql` (applied to prod
first, then mirrored):

- `profiles`: `bankroll_preferences`, `diamond_arena_preferences`,
  `memory_games_preferences`, `news_preferences`,
  `video_library_preferences` (jsonb ×5 — matches the existing
  `hub_preferences`/`reels_preferences` pattern; the five preference
  services in `src/services/*Preferences.js` need zero code change) and
  `memory_elo` (int — `src/games/ELOService.js` read/wrote it; every memory
  game rated players against a column that didn't exist).
- `horse_source_assignments.source_type` (poker vs sports distinction used
  by the admin initializer and ClipDeduplicationService).
- `player_notes` UNIQUE (user_id, target_user_id) — upsert identity for
  cross-device note sync (0 duplicate pairs verified first).
- `training_scenarios.game_id` + `.cached` (client filters; table is empty
  so no backfill).
- `sandbox_sessions.action_history`, `sandbox_results.full_analysis` — the
  sandbox writer stores them and the study-deck reader
  (`useStudyDeck`) replays them; the whole study-replay feature was dead.
- `poker_venues.source_priority` — BaseScraper's higher-priority-source-wins
  guard (provenance only; live-table data untouched per live-cash-games
  policy).

### 2. Rename/repoint to the real column (aliased where downstream reads the old name)
- `notifications.body` → `message`; `probe_heartbeats.metadata` → `details`;
  `live_help_analytics.{conversation_id,metadata}` → `{session_id,details}`;
  `profiles.last_seen_at` → `last_seen`; `user_mfa_factors.verified_at` →
  `updated_at`; `training_events.payload` → `event_data`;
  `training_sessions.completed_at` → `created_at` (+ `score` →
  `gtow_score`); `trivia_pvp_queue.updated_at` → `created_at`;
  `social_posts.{user_id,post_type}` → `{author_id,content_type}`;
  `messenger_conversations.name` → `title`.
- PostgREST select aliases preserved downstream field names:
  `hero_cards:hole_cards` (leaks/detect), `situation_snapshot:hand_data` +
  `ev_loss_bb:ev_loss` (leak_hand_examples), `pot_total:pot_size` +
  `rake:rake_amount` (HandReplayerModal), `source_key:source_name` +
  `horse_profile_id:horse_id` (horse_source_assignments),
  `target_player_id:target_user_id` + `note_text:notes` (player_notes).
- `user_level_progress` (MemoryCampaignView): write AND read remapped to
  the real `level_id/accuracy/attempts/status` shape (PK user_id+level_id).
- `hand_history`: `pages/api/poker/engine/hand-history.js` POST rewritten
  from the imaginary `hand_id/user_id/hand_data/pot_total` upsert (no such
  columns, no such unique constraint — no hand was ever recorded) to the
  real row shape established by sweep 3's HandHistory.js fix (players/
  winners jsonb with userId keys, full record JSON in `summary`); GET
  participant filter now matches `p.userId`. HandReplayerModal parses
  `summary` for replay.

### 3. Derive what the schema stores differently
- `messenger_participants.unread_count`/`is_pinned`/`metadata`: the
  conversation list select 42703'd — **the messenger sidebar loaded empty
  every time**. Real columns: `last_read_at` + `settings` jsonb. Unread is
  now derived from `last_read_at` in one batched query (mirroring the
  hardened `/api/messenger/get-conversations` logic) in both
  `useMessengerService.loadConversations` and the 30-second inbox poll in
  `pages/hub/messenger.js` (the poll wasn't in the scanner report — its
  chain shape eluded static association — but it was the same 42703 every
  30s; fixed alongside). Pinning/E2E keys/archival now live in `settings`
  (merged on update so keys don't clobber each other).
- `training_leaderboard.rank`: rank is positional, not stored. The realtime
  poll now derives it exactly like the leaderboard API orders (count of
  rows ahead by accuracy desc, questions_correct desc, +1).
- `poker_sessions.status` (contextAuthority): no status column — an open
  session is `ended_at IS NULL`, completed is `ended_at` set. LIVE_PLAY and
  the post-session cooldown now actually work; SESSION_PAUSED is
  unrepresentable and documented as such.
- `poker_venues.active_tables` (game-threshold-cron): live counts come from
  `venue_live_tables` per the live-cash-games policy — non-simulated rows
  only (`sim-` batches excluded), latest scrape batch per venue+source,
  Bravo preferred over PokerAtlas, venue names joined via the shared
  `normalizeForMatch`/`resolveVenueName` from venue-dedup. **No table-size
  push alert had ever fired**; now they can.
- `social_messages.receiver_id` (SocialService): DMs are
  conversation-scoped. get/send now resolve (or create) the pair's 1:1
  `social_conversations` row + participants, matching the model the horse
  engines already use.
- `social_likes.comment_id` (ReelsFeedCarousel): comment likes live in
  `social_interactions` with `metadata->>comment_id` (the write path
  already did this); the like-resync read now queries the same place.
- `MediaUploadService.deleteMedia`: bucket derived from `content_type` the
  same way `fn_create_media_upload` assigns it; removes `storage_path`.
  The failed-upload path deletes the orphaned row (no `status` column).
- ProfileHoverCard rendered `xp_total` under a "Diamonds" label — now
  selects and renders `diamonds` (which is what the UI always claimed).

### 4. Remove impossible code (with in-code tombstones explaining why)
- `profiles.xp_total` selects removed (XP BAN: the `xp_ban_guard` event
  trigger forbids the column ever existing; check-auth-uuid + hover card).
- `pages/api/poker-brain/migrate-equities.js` retired to 410 Gone: it
  "migrated" pb_hands columns (`schema_version`, `low_equity`,
  `equity_needs_recompute`) that never existed, and nothing reads the flags
  it claimed to set. There is no legacy data to migrate.
- contextAuthority's "active training session" check removed
  (training_sessions rows are completed records; the branch never fired).
- debug-clips' `is_active` filter removed (dev-only route; column absent).
- `src/services/chart-service.js` DELETED: zero importers anywhere in the
  repo, and it modeled a `memory_charts_gold` shape (id/category/
  chart_name/chart_grid) that has never matched the real table
  (chart_id/game_type/hand_matrix/...). Dead code pinning phantom columns.

### 5. Foreign-project exclusion
- `src/lib/mlb_cached_data.ts` queries the MLB Supabase project via
  `getMlbSupabase()` (utils/supabase/mlb) — the World Hub schema document
  is the wrong authority for it. Added to the scanner's
  `FOREIGN_PROJECT_PATHS` next to the existing `src/lib/mlb_data` entry
  (the file predates the exclusion list's prefix). `v_hitter_profile.player_class`
  and `v_pitcher_profile.role` were the last two findings.

## Gate flip

`.github/workflows/build-safety-gate.yml` CHECK 13: `--warn-only` removed;
step renamed and comment updated with the burn-down history. Same-day flip
per the standing doctrine: a gate nobody has to obey is not a gate.

## Verification

- Scanner: 0 phantom / 0 stale allowlist / 2,764 call sites, run against a
  schema stub regenerated from information_schema plus this phase's
  migrations (matches prod: migration applied via Supabase MCP before the
  code shipped).
- Syntax: every modified file passed `node --check` or esbuild
  (jsx/ts/tsx loaders).
- Constraints verified in prod before writing upserts against them:
  `horse_source_assignments` UNIQUE(horse_id,source_name),
  `user_level_progress` PK(user_id,level_id), `messenger_participants`
  UNIQUE(conversation_id,user_id); `player_notes` unique index created by
  this phase's migration after confirming 0 duplicate pairs.
- CI + production deploy verification recorded in the rollout section
  below after push.

## Notes / follow-ups

- `horse_source_assignments` carries a pre-existing
  UNIQUE(source_name,is_primary) constraint that caps a source at two
  horses (one primary, one not). Not a phantom-column issue; flagging for a
  future schema pass.
- The sweep-1/2/3 commits' deploy verification (Vercel build + /api/health)
  is folded into this phase's final verification since all four land on
  main within the same window.
