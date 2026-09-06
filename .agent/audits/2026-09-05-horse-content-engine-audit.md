# Horse Content Engine Audit (2026-09-05)

Scope: the social-content side of the 1,000-horse fleet (posts, reels, stories,
comments, likes). Sources: workers repo `main@3538173` (the code that runs),
World Hub `src/content-engine` + `archive/cron` (stale mirrors), club-arena
`HorseOnboarding.ts`, and production Supabase read 2026-09-05. Numbers are 7 and
30 day windows ending 2026-09-05. The rendered version with tables is
`horse-content-engine-audit.html` beside this file.

## Read this first: the summary Dan was given is wrong in three places

1. **There is no gpt-4o.** The live engine makes zero language-model calls.
   Captions come from hard-coded phrase pools (13 to 21 lines per category) in
   `HumanVoiceEngine.ts`. The `content_settings` row (gpt-4o, 20 posts/day, peak
   hours 9-21) was created 2026-01-14, never updated, and is read by nothing that
   runs. Admin-panel edits to it go nowhere.
2. **The "designated pool" is an accident.** The 100 posting horses are the 100
   `content_authors` rows with the lowest `profile_id` sorted as text
   (`horse-by-index.ts`: `.order('profile_id').limit(100)`). The 09-02 identity
   backfill silently changed the pool's membership.
3. **Only ~8% of the fleet can ever like, comment or reply.**
   `shouldHorseBeActive(id, minute, 2)` expects four fires an hour
   (`CRON_TRIGGERS = [8,23,38,53]`, unreferenced). `horses-social-all` now fires
   at :00 every 2h, so only horses with hash slot 58..2 pass. Verified: 58 of the
   66 horses that commented in 14 days sit in those slots.

## 1. How it actually works

Open Claw dispatcher (Hetzner) -> workers `src/routes/*` (Hono/TS) -> Supabase.
Club-arena writes no social content; it mints the `content_authors` row.

| Job | Schedule (UTC) | Does |
| --- | --- | --- |
| `horse-batch/0..9` | once a day each, 2.5h apart | 10 horses each, one post each -> exactly 100 posts/day |
| `horses-social-all` | every 2h at :00 | likes, comments, replies, reactions, DMs |
| `horses-stories` | :05 :20 :35 :50 | 2 horses per fire -> `social_stories` |
| `horses-social-friends` | every 6h | friend requests / accepts |
| `scrape-sports-clips` | 04:00 | `sports_clips` (8,236 rows) |
| `video-library-reels` | 07:00 | Python bridge, nothing written since 04-22 |

`social_reels` are never written by a horse job; a DB trigger mirrors video posts.

Per post: 75/25 poker/sports roll, news link first (2 poker RSS feeds, 20 items
each, exhausted early), fallback to video. Poker video = 150 YouTube clips
hard-coded in `ClipLibrary.ts`. Voice = hash of `profile_id`; bio, voice,
specialty, stakes, city, personality are never read. 0/1,000 have `personality`;
593 have the templated bio.

## 2. Measured state

- 1,000 horses; 640 have never posted, commented, liked or reeled; 123 posted in
  the last 7 days; exactly 100 posts from exactly 100 horses per day.
- 30 days: poker video 1,337 posts from 133 clips (each ~10x/month); sports video
  945 posts, one caption ("Nobody touches him when he is locked in") used by 26
  horses; poker links 460 from 113 URLs; sports links 48; text posts 0.
- 7 days: 284 horse comments from 59 horses (top: "Real talk" x8; 32 on human
  posts); 556 stories from 145 horses; 1,405 reels (144 native reels `queued`
  since 08-14, 112 YouTube `failed`); 0 horse DMs; 108 human posts.
- **0 human likes and 0 human comments on any horse post in 7 days.**
- `horse_hand_reviews`: 197,829 rows in 7 days (cards, board, actions, pot,
  net_bb, is_win, leak_tags). Never used for content.

## 3. Defect register

| ID | Sev | Defect |
| --- | --- | --- |
| D-01 | critical | Engagement gate admits ~8% of fleet (minute-slot vs 2h cron) |
| D-02 | critical | Posting capped at 100 horses by UUID sort order; stories `limit(100)` unordered |
| D-03 | critical | Shared pools: 150 clips, 21 sports captions, 2 feeds; dedup is unordered `limit(100)` over 48h; phrase memory in-process, resets on restart |
| D-04 | critical | Horses never post about the poker they actually play |
| D-05 | high | Persona data written, never read |
| D-06 | high | `content_settings` read by nothing live; no kill switch; `pipeline_runs` has no writer; failures return 200 |
| D-07 | high | Comments bypass `HumanVoiceEngine` (no scrubber/memory); replies are 5 hard-coded prefixes; 89% of horse comments land on horse posts |
| D-08 | high | Zero human reactions to horse content |
| D-09 | medium | 144 native reels stuck queued 3 weeks; reels bridge dead since April |
| D-10 | medium | Three engine copies; LLM branch uses Grok client asking for gpt-4o, writes to `seeded_content` (7 writers, 0 readers) |
| D-11 | decision | 36% of horse posts are sports, set by a coin flip in code |

## 4. Every horse posting weekly

1,000/7 = 143 posts/day; the engine does 100 today. Volume is not the blocker;
eligibility (D-02) and freshness (D-03, D-04) are.

1. Weekly slot per horse: `hash % 7` = day, second hash = hour in the horse's
   awake window in its timezone. Hourly job asks "who is due now" across all
   1,000. No batches, no `limit(100)`.
2. Weekly is the floor: persona cadence from every 10 days to daily, jittered
   hour. Fleet lands at 150-200/day.
3. Same fix for engagement: hourly fire, hour-granularity gate.
4. Dedup as tables: `content_asset_use` (no asset twice in 30 days platform-wide,
   never twice per horse) and `horse_phrase_ledger` (trigram similarity).

## 5. Fresh content without a shared pool

- **Tier 1, grounded (unique by construction, zero cost):** weekly hand-of-the-week
  / session recap / tournament finish from `horse_hand_reviews`,
  `horse_daily_nets`, `tournament_players`. Never name a human opponent. Numbers
  must match the ledger.
- **Tier 2, curated media, partitioned:** `poker_clips` table + scraper (retire
  the 150 hard-coded), per-horse source slices, the 7 news sources
  `content-health-check` already monitors.
- **Tier 3, voice:** persona completion for all 1,000 into
  `content_authors.personality`; small-model captions from persona + grounded
  fact with phrase-ledger check, hard daily budget, template fallback.

## 6. Also

Humans-first targeting and reply-to-human trigger; worker honours
`engine_enabled` and writes `content_runs`; watchdog "no horse post in 4h";
unstick reels; delete the two dead engine copies; decide sports share per
persona; feed-composition and human-reaction metrics on the horses admin page.

## 7. Roadmap (agent-days)

- Phase 1 (~1): slot scheduler over all 1,000, hourly fire, DB ledgers,
  run ledger + kill switch, unstick reels. Every horse posts weekly.
- Phase 2 (~2-3): grounded generators from real hands; text posts back on;
  no-human-alias law test.
- Phase 3 (~2): persona completion; model captions behind a cap; `poker_clips`.
- Phase 4 (~2): engagement rework; one engine; admin wired to live settings.

## 8. Dan's calls

1. Model spend: templates first, model in Phase 3 behind a cap (recommended).
2. Sports share: per persona, fleet average ~15% (recommended).
3. Cadence: weekly floor with spread (recommended) vs strict weekly.
4. Confirm: a horse never names a human player anywhere.
