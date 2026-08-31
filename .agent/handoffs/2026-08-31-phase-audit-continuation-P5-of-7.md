# HANDOFF — 7-PHASE AUDIT PROGRAMME, RESUME AT **PHASE 5 OF 7**

**Written:** 2026-08-31 ~12:25 UTC
**Author:** previous Cowork/Claude session
**Your first action:** read this file top to bottom, then run the "VERIFY BEFORE
YOU TOUCH ANYTHING" block. Everything below was true at the timestamp above and
is written so you can re-check it rather than trust it.

---

## 0. THE ONE-PARAGRAPH VERSION

Dan asked for a list of everything still wrong in the waitlist / lobby-filters /
table-theme area, broken into phases, built one at a time. Phases 1-6 were BUILT
in a single burst (Dan objected to that pace — see §2), and are now being
**AUDITED ONE PHASE AT A TIME**, in order, fixing every bug found before moving
on. **Phases 1, 2, 3 and 4 are audited and closed. You are starting the PHASE 5
audit.** Every audit so far found at least one real defect that had shipped, so
audit properly — do not assume the previous session got it right.

---

## 1. DAN'S STANDING INSTRUCTIONS (BINDING — HE HAS REPEATED THESE)

Verbatim, in the order he said them:

1. *"NOW TAKE EVERY SINGLE THING YOU JUST SAID NEEDED TO BE DONE AND BREAK THIS
   DOWN INTO PHASES AND LET ME KNOW IN THE SUMMARY PHASE 1 OF X IS DONE, WITH THE
   SUMMARY, FOLLOWED BY READY TO START PHASE 2 OF X."*
2. *"BRO NO SHOT YOU'VE DONE THEM ALL THAT FAST, YOU WERE TO TAKE THEM ONE AT A
   TIME... SMH. MAKE SURE EVERYTHING FROM THE PREVIOUS PHASE(S) WAS 100%
   COMPLETED, FINISHED EVERY STEP AND IT WAS PUSHED AND PUBLISHED, CHECK FOR ANY
   AND ALL BUGS, GAPS, STUBS, ERRORS, REGRESSIONS OR WIRING ISSUES ANYWHERE AND
   EVERYWHERE AND FIX ANY ISSUES BEFORE MOVING ONTO THE NEXT PHASE. AUDIT THEM
   ONE PHASE AT A TIME."*

**What this means for you, concretely:**

- **ONE PHASE PER REPLY.** Audit it, fix what you find, ship it, verify it
  landed, then STOP and report. Do not start the next phase in the same turn.
- End each report with the exact shape: **"PHASE N OF 7 IS DONE"** + summary,
  then **"READY TO START PHASE N+1 OF 7"**.
- **"Pushed AND published" are different things.** Merged to `main` is NOT live.
  See §6 for how to check publication properly — this repo's publish path has
  real lag and it has bitten this programme twice.
- Dan is technical and checks. Do not claim anything you have not verified with
  a command whose output you read.

---

## 2. WHY THE AUDIT EXISTS (READ THIS, IT SETS YOUR STANDARD)

The previous session built Phases 1-6 quickly and reported them all done. Dan
pushed back. The audits then found, **in phases that had been reported as
complete and were already in production**:

| Phase | Defect found during audit | Severity |
|---|---|---|
| 1 | Two of three `table_waitlist` writers didn't know the unique index had widened | Real |
| 2 | **The cron alarm could never fire** — `node ... \| tee` hid the exit code | Critical |
| 3 | **"You Are #0 In Line"** rendered live in production when a hold lapsed | Real, user-visible |
| 4 | A slider drag wrote the filter row **dozens of times** to the DB | Real, perf/cost |

Every single audited phase had a defect. **Assume Phase 5 does too.** The
pattern in all four: the happy path worked and was tested; the *edge* (expiry,
non-zero exit, a second writer, a continuous input) was not.

---

## 3. THE SEVEN PHASES AND THEIR STATUS

| # | Phase | Built | Audited | Notes |
|---|---|---|---|---|
| 1 | Waitlist DB integrity (dup rows + one-hold-per-player) | YES | CLOSED | 2 defects fixed |
| 2 | Cron fleet-silence alarm | YES | CLOSED | 1 critical defect fixed |
| 3 | 60-second hold countdown UI | YES | CLOSED | 2 defects fixed |
| 4 | Cross-device lobby filters | YES | CLOSED | 1 defect + 1 house-rule violation |
| **5** | **Buttons locked in on Hub surfaces (dealer button)** | YES | **NOT AUDITED — YOU ARE HERE** | |
| 6 | Sandbox felt — one source of truth | YES | pending | |
| 7 | Final verification sweep across all phases | — | pending | |

---

## 4. VERIFY BEFORE YOU TOUCH ANYTHING

Run these first. They establish whether the world still matches this document.

```bash
export PATH=/opt/homebrew/bin:$PATH

# Worktrees this programme uses (see §9 — do NOT work in the shared clone)
CA=~/Documents/.agent-trees/club-arena/cowork-filters-saveclick
WH=~/Documents/.agent-trees/wh-theme-bridge

cd $CA && git fetch -q origin && git log origin/main --oneline -1
cd $WH && git fetch -q origin && git log origin/main --oneline -1

# What production actually serves
curl -s "https://smarter.poker/api/health?cb=$RANDOM"
curl -s "https://smarter.poker/hub/club-arena/ca-provenance.json?cb=$RANDOM"

# Is the cron outage still open? (see §7 — the one item blocked on Dan)
ssh -i ~/.ssh/hetzner_deploy root@178.104.160.250 \
  "journalctl -u openclaw.service --since '5 min ago' --no-pager \
   | grep -oE '-> vercel [0-9]{3}' | sort | uniq -c"
```

Supabase (via the Supabase MCP, project `kuklfnapbkmacvwxktbh`):

```sql
SELECT
  (SELECT public.fn_cron_fleet_silence(25) ->> 'silence_minutes')  AS cron_silence_min,
  (SELECT max_concurrent_holds FROM public.waitlist_policy WHERE id) AS hold_cap,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='user_lobby_filters')  AS filter_policies,
  (SELECT has_table_privilege('anon','public.v_spin_draw_booking_gaps','SELECT')) AS spin_leak_open;
```

**Expected at time of writing:** `hold_cap=1`, `filter_policies=4`,
`spin_leak_open=false`, cron silence non-zero and the fleet still 401ing.

---

## 5. PHASE 5 — YOUR ACTUAL TASK

### What Phase 5 shipped (WH PR #1080, merged)

"Buttons" is the last of Dan's four theme nouns — *"TABLE, BACKGROUND, BUTTONS,
CARDS SHOULD BE LOCKED IN AT EVERY TABLE ACROSS THE BOARD"*. Arena stores the
Controls design in `user_theme_settings.button_id` and paints it via
`data-button-theme` + `src/components/table/ControlThemeTokens.css` (7 CSS
custom properties per design, 10 designs).

**Scope was deliberately narrowed to ONE button** — the dealer marker in
`src/components/training/games/UniversalDynamicTable.jsx` — because five of the
seven tokens style Fold/Check/Raise and **no World Hub surface has those
controls** (the sandbox has none; that table's buttons are quiz answers).
Shipping the full sheet would have been five CSS variables nothing reads, which
is the exact "defined 37 times, read by `var()` zero times" defect Arena's own
comments record.

**Files changed:**
- `WH src/lib/clubArenaTheme.js` — added `DEALER_BUTTON_STYLES` (10 designs,
  bg + color copied verbatim from Arena including conic/radial gradients),
  `PRESET_BUTTONS` (preset -> Controls design), `resolveArenaDealerButton()`,
  and `buttonId` / `dealerButton` on `getClubArenaTheme()`.
- `WH src/components/training/games/UniversalDynamicTable.jsx` — the dealer
  button spreads `arenaTheme.dealerButton` over `styles.dealerButton`.

**What was verified when built:** all 5 resolver paths (direct id, via preset,
unknown id, nothing saved, conic gradient survives), and that `arenaTheme` state
is scoped to the component that renders the button (line ~1544 inside
`UniversalDynamicTable` starting ~1464) rather than its sibling `LoadingSkeleton`
(~1053). `npx tsc --noEmit` reported 0 errors for that file.

### What the Phase 5 audit MUST check (suggested, not exhaustive)

1. **Is it actually visible?** The dealer button only renders when
   `dealerButtonSeatIndex` resolves and a `lawKey` exists. Confirm the themed
   style is actually reached — the previous session never rendered this
   component, only reasoned about scope.
2. **The `LoadingSkeleton` duplicate.** There are TWO `arenaTheme` states in
   that file (~1053 and ~1544). Confirm the skeleton's felt and the live
   table's button cannot disagree, and that two subscriptions per mount is
   acceptable.
3. **Does `PRESET_BUTTONS` match Arena's real catalog?** It was hand-derived
   from `THEME_PRESET_CATALOG` in `club-arena/src/lib/tableTheme.ts`. **Diff it
   against the source** — a wrong mapping silently paints the wrong button.
   Arena's catalog: default-dark->classic-white, classic-brown->gray-d-gear,
   neon-blue->blue-crystal, rustic-wood->gold-star, casino-green->gold-star,
   ocean-depths->classic-white, crimson-club->red-d-gear,
   arctic-suite->ocean-pearl, amethyst-night->amethyst-chip,
   carbon-ion->carbon-ion.
4. **Drift guard.** `__tests__/arena-theme-assets-exist.test.mjs` guards skin /
   background / card-back artwork. It does **NOT** guard the button styles.
   Consider extending it: every `DEALER_BUTTON_STYLES` key should exist in
   Arena's `ControlThemeTokens.css`, and every `PRESET_BUTTONS` value should be
   a real design id.
5. **Published?** WH PR #1080 merged — confirm it is actually live (§6).
6. **The honest open question for Dan:** the other five control tokens remain
   unported because nothing consumes them. If Dan wants Fold/Check/Raise themed
   on the training surfaces, that is a *restyle* of those UIs and a real design
   decision — surface it, do not silently do it.

---

## 6. PUBLISH PIPELINE — HOW TO CHECK "IS IT LIVE"

Two separate apps, two separate answers.

**World Hub (Next.js):** `main` -> Vercel git integration -> `smarter.poker`.
```bash
curl -s "https://smarter.poker/api/health?cb=$RANDOM"   # .version = short WH sha
```

**Club Arena (Vite SPA):** CA `main` -> GitHub Action `build-for-world-hub.yml`
-> commits a built bundle into WH -> Vercel publishes WH.
```bash
curl -s "https://smarter.poker/hub/club-arena/ca-provenance.json?cb=$RANDOM"
# .commit = the CA commit whose bundle is live
```

**To prove a specific CA PR is live:**
```bash
cd $CA
PUB=$(curl -s "https://smarter.poker/hub/club-arena/ca-provenance.json?cb=$RANDOM" \
      | python3 -c "import sys,json;print(json.load(sys.stdin)['commit'])")
M=$(gh pr view <PR> --json mergeCommit -q '.mergeCommit.oid')
git merge-base --is-ancestor "$M" "$PUB" && echo PUBLISHED || echo "not yet"
```

**Known behaviour, not a bug:** the sync workflow uses `cancel-in-progress`, so
rapid merges supersede each other and a given commit can sit 5-15 minutes (I
observed a 10-commit backlog). It is a QUEUE, not a stall — confirm movement by
watching `.commit` change, or `git log origin/main --grep="sync build"` in WH.

---

## 7. THE ONE ITEM BLOCKED ON DAN — **CRON_SECRET MISMATCH (STILL OPEN)**

**This is the highest-impact open item on the whole platform and no agent can
fix it.**

Production's `CRON_SECRET` was rotated and the Hetzner Open Claw VM was never
updated. All 85 scheduled jobs return **401**. Confirmed still live at handoff:
16x `-> vercel 401` in the last 4 minutes, and only **one** job has recorded a
run in the last 3 hours.

**What is dead while this persists:** push notifications (`push-dispatch`),
every anti-cheat and collusion scan, `chip-supply-snapshot`, `spin-sweep`,
`bbj-detect`, `tournament-bounty-detect`, and the `waitlist-sweep` that Phase 1
depends on to advance the queue.

- Full write-up: `WH .agent/handoffs/2026-08-31-cron-secret-mismatch-openclaw-401.md`
- Alarm issue: **WH #1088** (raised automatically by the Phase 2 watchdog —
  it is a TRUE alarm and will self-close once the fleet records runs again)
- Why no agent can do it: reading the current production secret needs the Vercel
  CLI, whose token is **also rejected** (`vercel whoami` -> "token is not valid"),
  and the Vercel MCP exposes no env-read tool. This is the RULE 0 credential
  exception.
- Second, smaller trap found: `/opt/openclaw/.env` on the VM holds a
  **different** `CRON_SECRET` (fingerprint `dcce68dd475f`) from
  `/etc/openclaw.env` (`5eb74390bc5b`). It is inert today (systemd loads
  `/etc/openclaw.env`) but will mislead whoever debugs this by hand.

**Consequence for Phase 1 you should understand:** the waitlist queue only
advances when someone cashes out, because the per-minute sweep that also
advances it is 401ing.

---

## 8. A LIMITATION IN MY OWN PHASE 2 ALARM (FOUND WHILE WRITING THIS HANDOFF)

`fn_cron_fleet_silence` computes the fleet verdict from **the newest row across
ALL jobs**. At 11:31 a single job (`/cron/daily-challenges`, probably triggered
outside Open Claw) recorded one run — and that **reset the silence clock from 96
minutes to ~41**, while 84 other jobs stayed dead.

So a single surviving job can mask a fleet-wide outage for up to the 25-minute
threshold. The `late_jobs` list still tells the truth (it correctly shows
`hard-stop` quiet 194 min against a 1-minute cadence, `collusion-scan` 223 min
against 30, etc.).

**Suggested improvement (not yet built):** make the verdict consider
`runs_last_hour` collapsing against its own recent baseline, not just the newest
row — e.g. alarm when `runs_last_hour` is under ~10% of the trailing median for
that hour-of-day. Present state: `runs_last_hour = 1` where normal is ~118.
This is a genuine hole in work I shipped; do not let it slide.

---

## 9. HOUSE RULES THAT WILL BITE YOU (LEARNED THE HARD WAY THIS SESSION)

1. **NEVER work in the shared clones** `~/Documents/club-arena` or
   `~/Documents/Smarter-Poker-World-Hub`. Hooks refuse commits/pushes there, and
   an Antigravity `git reset --hard origin/main` loop destroys uncommitted work.
   Use the worktrees in §4. (`AGENT_SHARED_CLONE_OK=1` exists but do not.)
2. **Never copy whole files between the shared clone and a worktree.** Husky runs
   Prettier on commit in the shared clone, so its files are reformatted relative
   to `main`. I did this once and produced a **10,000-line diff**; I re-applied
   just my hunks with a script instead and got 31 lines. Always
   `git checkout origin/main -- <file>` in the worktree, then apply your hunks.
3. **`main` is protected.** Push a branch, open a PR, `gh pr merge --squash
   --auto`. Direct pushes to `main` are refused.
4. **Source-reading tests must NOT bound windows by a byte count.** Use
   `tests/helpers/sourceWindow.ts` (`sliceMethod`, `sliceStatement`,
   `sliceEnclosingBlock`, `sliceYamlBlock`, ...). A meta-test
   (`tests/unit/noFixedSizeSourceWindows.test.ts`) enforces this and it failed my
   commit. The reason is real: a byte-count window once drifted off the code it
   guarded and cost a **39-minute publish outage** for the whole estate.
5. **Never spend real chips to test a rule** (CLAUDE.md 11.5). Probe money paths
   inside a transaction you **roll back**; `GET STACKED DIAGNOSTICS` survives the
   rollback so you still get the error message. I used a
   `RAISE EXCEPTION 'AUDIT|...'` at the end to return values out of a rolled-back
   `DO` block — steal that pattern.
6. **New tables/columns must be added to BOTH manifests** or CI fails claiming
   your applied migration was never applied:
   `scripts/ci/supabase-columns-manifest.json` and
   `scripts/ci/supabase-schema-manifest.json`. Verify with
   `node scripts/ci/check-migrations-applied.mjs origin/main`.
7. **A "Fact-Forcing Gate" hook blocks Edit/Write.** It demands: importers of the
   file (via Grep), affected functions, data shapes, and Dan's instruction
   verbatim. Present those four facts in your message, then retry the identical
   call — it succeeds.
8. **GitHub API rate limits are reachable.** `gh run list` started 403ing. Fall
   back to `git` (`git log origin/main --grep=...`) and `curl` against production.
9. **No emoji in source.** Popups are Title Case, no em dashes. Never call horses
   "bots". Horses are players (CLAUDE.md 10.5).
10. Migrations are applied via the **Supabase MCP `apply_migration`**, then the
    same SQL is mirrored into `supabase/migrations/` in the repo.

---

## 10. EVERYTHING SHIPPED IN THIS PROGRAMME (FOR YOUR CONTEXT)

### Original three features (before the phase programme)
- **CA #2007** — lobby filters persist on every click, not only on Apply.
- **CA #2014** + migration `sixty_second_exclusive_seat_hold` — 60s exclusive
  seat hold: `fn_offer_open_seat` TTL 60s + `table_waitlist.hold_expires_at`;
  `atomic_table_buyin` refuses non-holders with `SEAT_RESERVED`; offer toast and
  bell deep-link to `/table/:id?buyin=1`; TablePage auto-opens the buy-in.
- **WH #1053** — `src/lib/clubArenaTheme.js` bridge + artwork copied to
  `public/hub/table-theme/`; training tables + sandbox paint the Arena theme.
- **WH #1076** — training tables paint the player's **card back** (both files
  hardcoded `classic_red.webp`).
- **WH #1070** + migration `sweep_honours_the_sixty_second_hold_and_advances_the_queue`
  — the sweep expires by `hold_expires_at` AND re-offers the seat (it previously
  told the player their seat "went to the next player in line" and then offered
  it to nobody); cadence `*/10` -> `*/1`; dispatcher deployed to Hetzner.
- **CA #2071** + migration `spin_reconciliation_views_are_not_a_public_api` —
  **SECURITY**: `v_spin_draw_booking_gaps` and `v_spin_unpaid_settlements` were
  readable by **anon** with only the public key, exposing `club_id`,
  `buy_in_amount`, `prize_drawn`, `prize_credited`, `draw_under_booked_by`.
  Revoked; re-probed from outside -> 401.
- **WH #1075** — the CRON_SECRET incident handoff.

### Phase builds
- P1 **CA #2079** + migration `waitlist_one_active_row_and_one_live_hold`
- P2 **WH #1078** + migrations `fn_cron_fleet_silence_detects_a_dead_fleet` and
  `cron_fleet_silence_judges_each_job_by_its_own_cadence`
- P3 **CA #2090**
- P4 **CA #2093** + migration `lobby_filters_follow_the_player_between_devices`
- P5 **WH #1080**; P6 (sandbox felt) shipped in the same PR

### Phase AUDIT fixes (the important ones)
- P1 audit -> **CA #2103**: `WaitlistManager.handleJoin` had no 23505 recovery
  (said "Failed to join waitlist" to someone already in line);
  `HorseFleetManager.ensureWaitlist` built its already-queued set from
  `status='waiting'` only, so one 23505 would lose a whole batch insert.
  4 tests; verified 3 of 4 FAIL against the unfixed code.
- P2 audit -> **WH #1085**: `node ... | tee` reported **tee's** exit code, so the
  alarm step never ran and the *recovery* step ran instead — it would have closed
  a genuine issue every 30 minutes. Now uses `PIPESTATUS[0]` published as a step
  **output**, so exit 1 (fleet down) and exit 2 (cannot reach Supabase) are
  distinguishable; exit 2 now does nothing at all.
  **Proven end-to-end**: ran the real workflow -> issue #1088 created, dedupe
  confirmed (2nd run added a comment, still 1 issue), close-step stayed idle.
- P3 audit -> **CA #2124**: lapsed hold rendered **"You Are #0 In Line"** and
  froze. Fixed twice over (tick prunes lapsed holds + render filter makes it
  structurally impossible). Offer card also had a blank table name; now resolved
  with one read. 4 tests.
- P4 audit -> **CA #2140**: slider-drag write storm -> debounced remote push
  (`REMOTE_SYNC_DEBOUNCE_MS = 700`) with an unmount/clubId-change **flush** so
  tap-then-close is not lost. localStorage still immediate. 5 timer tests + a
  guard test that fails if a future `setStore` skips `touchedRef`. Also fixed my
  own byte-count source window (see §9.4).

### Verified-and-clean during audits (do not redo)
- **RLS on `user_lobby_filters` genuinely enforces ownership** — impersonated
  `authenticated` with a real JWT claim: player A wrote their own row, affected
  **0** of B's rows, read **0** of B's rows.
- **Seat-hold exclusivity proven end-to-end** — offer made -> `hold_expires_at`
  written -> another player refused with `SEAT_RESERVED` -> the **holder** not
  refused by their own hold. (Needs a 2-seat table to observe; with 8 free seats
  letting someone else sit is CORRECT.)
- **A capped head-of-queue does NOT block the queue** — the seat passes to the
  next player.
- **Money-path SECURITY DEFINER functions are properly gated** — the one
  suspicious hit (`ca_union_record_presettlement`) derives its actor via
  `ca_can_oversee_union()` -> `auth.uid()`. False positive.
- **No other ops/financial view is anon-readable** (swept).
- `training_leaderboard_top` is anon-readable **by design** (rank, accuracy,
  streaks). Not a leak.
- `spatial_ref_sys` RLS advisor error is PostGIS reference data — genuine false
  positive.

---

## 11. BACKLOG BEYOND PHASE 7 (Dan has seen these; not yet scheduled)

1. **Fold/Check/Raise theming on Hub surfaces** — needs a restyle decision (§5.6).
2. **`fn_cron_fleet_silence` single-job masking** (§8).
3. **`solver-watchdog` noise** — retired 2026-08-27 but still in `late_jobs`
   until 14 days of history age out. Self-heals ~2026-09-10.
4. **`WaitlistManager` hard-DELETEs waitlist rows** (`handleLeave`,
   `handleSeatPlayer`, `handleRemove`) instead of setting a status, losing the
   audit trail. Pre-existing, not introduced here.
5. **`public.wallets`** is frozen with 732,591,994.33 chips and nothing reads it.
   Any money path writing there is broken (CLAUDE.md 11.5).
6. **Extensions in `public`** (postgis, pg_trgm, vector, dblink, plpgsql_check) —
   advisor warnings, low priority; `dblink` is the notable one.
7. **647 SECURITY DEFINER functions executable by `authenticated`** — audited the
   money-named subset only; the rest is unswept surface area.

---

## 12. YOUR FIRST MESSAGE SHOULD LOOK LIKE

1. Run §4's verification block; state what changed since this was written.
2. Audit **Phase 5 only** using §5's checklist — and look for what is not on it.
3. Fix everything you find, in a branch off `origin/main` in the WH worktree,
   with tests that you have **verified fail against the unfixed code**.
4. Confirm merged AND published (§6).
5. Report: **"PHASE 5 OF 7 IS DONE"** + what you found and fixed (say plainly if
   you found nothing, and say what you checked to be able to claim that), then
   **"READY TO START PHASE 6 OF 7"**. Then stop.
