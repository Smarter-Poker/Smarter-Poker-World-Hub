# HANDOFF - Stable Admin, Phase 5 of 10 (Game Integrity and Case Management)

Written 2026-09-06 09:15 UTC. Every number below was READ from production
while writing this, not carried over from the previous session. Phases A and
1 to 4 are merged, live and verified. **Phase 5 is not started.**

---

## 0. THE ONE THING TO UNDERSTAND BEFORE YOU DESIGN ANYTHING

**6,504 of the 6,508 findings produced in the last two days are
horse-versus-horse. Four involve a human. None is human-versus-human.**

```
pattern_type        total   horse_v_horse   horse_v_human   human_v_human
TIMING_CORRELATION   6082            6078               4               0
CHIP_DUMP             425             425               0               0
SOFT_PLAY               1               1               0               0
```

That is not noise to be filtered. **Horses share HorseLogic**, one
deterministic engine, so their action timing IS correlated by construction -
and CLAUDE.md 10.5 plus PHASE5-CONTRACTS section 0 rule 4 both say an operator
must see it, because two horses colluding is a HorseBehavior defect. An
`is_horse` filter was added to the scan on ~2026-09-01, suppressed all of it,
and was removed after CLAUDE.md 10.8 ruled on it. **Do not put it back. Do not
invent a variant of it.**

So the Phase 5 queue must make 425 chip-dump pairs findable underneath 6,078
timing rows **by ranking, grouping and disclosure - never by exclusion**. That
is section 0 rule 3 ("a score is not a verdict, and a queue is not an
accusation") and it is now the central design problem of the phase, not a
footnote.

**Open question worth answering early, with evidence:** are 425 horse-to-horse
CHIP_DUMP findings in two days a real HorseLogic defect, or detector
calibration? Either answer is valuable and neither is "hide it".

---

## 1. READ THESE FIRST, IN THIS ORDER

1. `AGENT-PLAYBOOK.md` (identical in all seven repos) - how to ship.
2. `~/Documents/Smarter-Poker-World-Hub/CLAUDE.md` - especially **10.5**
   (horses are players), **10.7** (merged is not landed), **10.8** (a check
   nobody sees), **10.9** (never the Claude scheduler), **11** (crons).
3. `~/Documents/club-arena/CLAUDE.md` - especially **4.5** (never hand-pick a
   migration version), **10.8** (laws; and the paragraph that begins "A LAW IS
   SOMETHING WRITTEN DOWN. DEPLOYED CODE IS NOT A LAW" - it is about this
   programme and about a mistake I made), **10.9** (you decide the money),
   **11.5** (never spend real chips to test a rule; read rule 1 twice).
4. `docs/horses/PHASE5-CONTRACTS.md` on `main` - the phase contract. **Its
   section 2 numbers are now STALE**; see section 4 below.
5. `.agent/audits/2026-09-04-the-detector-that-scanned-and-forgot.md` - the
   four-fault incident behind the detector you are about to build a console
   on. Read it for the traps, not the history.

---

## 2. VERIFIED PRODUCTION STATE (read 2026-09-06 09:13 UTC)

**The collusion detector is healthy and has been for two days.**

```
status              live
catching_up         false
seconds_behind      864          (cadence 30 min + a 60s commit-lag ceiling)
last_success_at     2026-09-06 09:00:23 UTC
last_scanned_hands  11924        (a normal 30-minute window)
newest_finding_at   2026-09-06 09:00:20 UTC
```

Last six runs: all `success`, 6.5s to 27.0s, each covering a clean 30-minute
window with no overlap and no gap.

**`stale` is still `true`, and that is correct, not a fault.**
`fn_ca_collusion_detector_health` refuses to answer `stale:false` while an
unscanned gap is recorded, and one is:

```
gap    2026-09-03 02:00:00+00 -> 2026-09-04 18:43:31.916024+00
hands  1,241,438  (re-counted today; unchanged)
```

Those hands were never examined by anything. Closing it is a real task (see
section 5), not a dashboard tidy-up. **Never clear `unscanned_from` /
`unscanned_to` / `unscanned_note` to make the banner go green.**

**Other Phase 4 state:**

- `ca_operator_policy.restrictions_enforced = false` - enforcement is OFF and
  it is Dan's switch, not yours.
- `ca_player_restrictions`: 0 rows. `ca_restriction_observations`: 0 rows.
- `restriction-maintenance` cron: 33 runs, newest 2026-09-06 08:20:02, status
  `ok`. Alive.
- Console tabs live on `main`: stable, fleet, pipeline, settings, stats, merch,
  promo, economy, mint, antiabuse, clubarena, bugreports, geeves, reviews,
  scrapers, audit, staff, approvals, **players**. No `integrity` tab yet.

**Phase 5 does not exist yet.** No `ca_integrity_*` table, no
`fn_ca_integrity_*` RPC, no `pages/api/horses/integrity-admin.js`.

---

## 3. WHAT IS ALREADY DONE (do not redo)

| Phase | State |
| --- | --- |
| A - remove the "AI Model" control | merged. Horses run HorseLogic, a deterministic engine, not an LLM. Guarded by `__tests__/horses-no-language-model-for-the-fleet.test.mjs` |
| 1-3 | merged and live (console shell, subpages, Fleet Command) |
| 4 - Player 360, restrictions, notes, tags | merged (#1332), live, browser-verified at desktop and 375px |
| Phase 5 section 1 - "fix the detector first" | **DONE.** Workers PRs #64, #66, #68, #69; WH migrations `20260904210000`, `214500`, `223000`, `233000` |

All on `main` and confirmed present today: `docs/horses/PHASE5-CONTRACTS.md`,
`supabase/migrations/20260904233000_*.sql`,
`__tests__/horses-an-rpc-write-has-a-where.test.mjs`,
`pages/api/cron/restriction-maintenance.js`, the audit note.

---

## 4. THE PHASE 5 CONTRACT IS PARTLY STALE - CORRECT IT BEFORE YOU BUILD

`docs/horses/PHASE5-CONTRACTS.md` was written 2026-09-04, before the detector
was fixed and before the horse filter was removed. Two sections no longer
match reality:

- **Section 1 ("THE FIRST TASK, AND IT IS NOT IN THIS REPO")** is complete.
  Section 1.1 already records what shipped and what the console must render
  because of it. Leave the history; do not re-do the work.
- **Section 2 ("What the data actually supports")** is wrong now. It says the
  actionable population is "about two dozen rows" and that every row scores 70+
  and is `WIN_RATE_ANOMALY`. Today:

  ```
  collusion_tracking   open 6,515   cleared 169,523
  last two days        TIMING_CORRELATION 6,082 | CHIP_DUMP 425 | SOFT_PLAY 1
  newest               2026-09-06 09:00:20   (it was 2026-08-28 when that
                                              section was written)
  ```

  `WIN_RATE_ANOMALY` has stopped dominating and `TIMING_CORRELATION` now does.
  **Update section 2 from a fresh count in your first commit**, and say in the
  header that you re-measured. A contract that mis-states the data is how the
  wrong queue gets built.

Still true and still binding: I3 (multi-accounting) stays deferred -
`signup_abuse_log` and `user_devices` are both still empty, so the graph would
have no edges and could not be told apart from a broken panel. Say so on the
tab; do not ship an empty graph.

---

## 5. THE WORK, IN ORDER

1. **Re-measure and correct PHASE5-CONTRACTS section 2** (above). One commit.
2. **Decide the queue's ranking model** so 425 chip-dump pairs are reachable
   under 6,078 timing rows without excluding a horse. Write the reasoning into
   the contract before the code.
3. **Migration**: `ca_integrity_cases`, `ca_integrity_case_items` (append-only,
   retraction rows, never deletes), `ca_integrity_sanctions`. Shapes are in
   contract section 3. **Get the version from
   `node scripts/new-migration.mjs "what it does"`** - see the trap in 6.2.
4. **RPCs**, all SECURITY DEFINER, `service_role` only, ACL restated in-file,
   reads audit nothing: `fn_ca_integrity_queue`, `_case_open`, `_case_add_item`,
   `_case_assign`, `_case_decide`, `_pairs`, `_timing`, `_detector_health`.
   Every one must carry a WHERE on every write - see trap 6.1.
5. **Route** `pages/api/horses/integrity-admin.js` through
   `withOperatorRoute(spec, handle)` - the single door for every `/horses`
   route. Sections: queue, case, pairs, flags, timing, hands, health. Actions:
   open_case, add_item, assign, decide, sanction. Reads need `players.read`;
   case writes `moderation.write`; a `confiscation` sanction additionally needs
   `money.write` AND goes through the Phase 2 approvals queue as kind
   `sanction` (deliberately NOT in `EXECUTABLE_APPROVAL_KINDS` - a human
   executes it).
6. **Panel + tab** `integrity`, label "Integrity", code split, permission
   `players.read`. Every section renders the detector-health banner first.
7. **Tests**, four-file split plus
   `__tests__/horses-phase5-integrity-is-honest.law.test.mjs`. Pins are listed
   in contract section 5. Wire every new test file into
   `__tests__/_test-guards-exist.test.mjs` - **this repo runs tests by import,
   not by glob**; five orphan files were caught that way in Phase 4.
8. **Close the 1,241,438-hand gap** or leave it recorded. To close it: rescan
   `?since=&until=` in slices of at most `MAX_SPAN_HOURS` (6), confirm coverage,
   then clear the three columns in a migration that says what it rescanned.
9. **Verification before Phase 6** (contract section 6): detector producing and
   visible; migration dry-run, applied, registered; a rolled-back production
   sim; console tests and build green; branch pushed; an adversarial review with
   its findings closed; **and the panel rendered in a real browser at desktop
   and 375px** - that step found two defects in Phase 4 that no test could.

---

## 6. TRAPS THAT COST THIS PROGRAMME HOURS. READ ALL SIX.

### 6.1 A WHERE-less UPDATE inside an RPC works everywhere except production

`authenticator` preloads `safeupdate`, so **every** call arriving through
PostgREST runs in safe-update mode and a WHERE-less UPDATE or DELETE is refused
with `21000 UPDATE requires a WHERE clause` - inside a SECURITY DEFINER
function as much as anywhere else. `postgres` does **not** preload it.

So the function works from psql, works in a rolled-back probe, works when a
migration calls it. Three migrations asserted `fn_ca_collusion_scan_advance`
and all three passed while the live detector had never once moved its mark, and
answered HTTP 200 the whole time. `last_scanned_hands` sitting at NULL after
four clean runs was the only evidence.

**Rule: for anything reached through PostgREST, the verification is a PostgREST
call.** `__tests__/horses-an-rpc-write-has-a-where.test.mjs` now guards this;
five other live functions still have the shape and are named in migration
`20260904233000` - all pg_cron/trigger-only today, each becomes this bug the
moment somebody exposes it as an RPC.

### 6.2 Never hand-pick a migration version

`20260904230000` was taken by another agent between my writing the file and
registering it - the second time in one day. Supabase keys `schema_migrations`
on the version and **the second file is silently never applied**.

`INSERT 0 0` on the registration is the entire warning you get. Read the row
count. Better: `node scripts/new-migration.mjs "what it does"` (club-arena) or
`bash scripts/reserve-migration-version.sh <slug>` - they check this tree,
`origin/main` **and every sibling worktree**, which is the only thing that can
see an unmerged collision.

### 6.3 `Prefer: tx=rollback` is NOT honoured, and one MCP call is one transaction

This deployment does not set `db-tx-end`, so the header is accepted and
ignored. My "safe" verification probe committed a run record that never
happened - 123 hands in 9 ms, which was my argument list, not a scan. I caught
it only because the numbers were absurd.

Over the Supabase MCP a transaction **does not span two calls**: `BEGIN` /
probe / `ROLLBACK` as three calls leaves the probe committed in the middle and
the ROLLBACK reports success having undone nothing. Use ONE call containing one
`DO` block that ends by `RAISE EXCEPTION` - **the error is the success case**.
If such a probe returns success, it committed; go and look at what it wrote.
Full text: club-arena CLAUDE.md 11.5 rule 1.

### 6.4 A budget that is only checked between pages is not a budget

The scan's read had a 90s wall-clock budget checked **before each page**, so a
page that never answered was never noticed - the loop could not reach its own
check. A run sat at `running` for over ten minutes with no error while the
identical read completed in 37.6s off-box.

Everything is now bounded: a per-page deadline, `withDeadline` around the horse
lookup, the insert, the state read and the advance, and a fetch timeout on the
client. **A fetch timeout alone is not sufficient** - measured: the abort fires
and the supabase-js call above it still never settles, and re-issues the
request. The deadline has to live where the `await` is. None of them retry; an
aborted request may already have executed.

### 6.5 Measure before you theorise, and strip literals before you count

Chasing that hang, I ruled out the read (40,000 hands, flat ~800ms/page), the
analysis (525ms over real data), the horse lookup (695ms) and the payload
(56 MB) before finding it held the whole window in memory. Every one of those
was a plausible story and four of the five were wrong.

Separately: asked how many functions hold a WHERE-less write, three scans of
the same question returned eleven, two and six. Six is right. The wrong two
tripped over semicolons **inside string literals** - one function writes a note
containing "raised; the prize path credited this player" and its perfectly good
WHERE reads as missing. Strip literals and comments before scanning SQL.

### 6.6 Merged is not landed, and a squash-merge orphans your branch

`agent-autopilot.yml` squash-merges as soon as checks pass - sometimes under
two minutes. Two consequences, both of which bit me:

- **A follow-up push to that branch reaches nobody.** New branch off current
  `main`, every time. `scripts/guard-merged-branch.sh` refuses it now.
- **Your local branch diverges from `main` the moment it merges**, because the
  squash commit has a different sha. Three of my branches went `dirty` this
  way, and one of them - had I pushed it - would have reverted 157 files of
  other agents' work. **After any merge: re-branch from `origin/main` and
  re-apply, and always diff `origin/main..HEAD` before pushing.**

---

## 7. STANDING LAWS (violating one of these outranks finishing the phase)

- **HORSES ARE PLAYERS.** Never `is_horse` to leave a horse out of something a
  human gets. Any `p_include_horses` defaults **true**. Never call a horse a
  bot. This is the law the collusion filter broke; do not re-break it.
- **A LAW IS SOMETHING WRITTEN DOWN. DEPLOYED CODE IS NOT A LAW.** I stopped
  this programme to ask Dan about a "conflict" between the live horse filter
  and the contract. There was no conflict: one binding law and one undocumented
  filter violating it. Before escalating, name both sides and say where each is
  written. If one side is a branch in a file with nothing written behind it,
  you have found the defect, and it is yours to fix.
- **YOU DECIDE THE MONEY** (10.9) when all five conditions hold. Future pricing
  and money leaving the platform stay Dan's.
- **Never schedule anything on the Claude scheduler.** Always Open Claw:
  handler in `pages/api/cron/`, registered in
  `scripts/openclaw-cron-dispatcher.py`, deployed with
  `bash scripts/deploy-openclaw.sh`.
- **Never spend real chips to test a rule.** Probe inside a transaction you
  roll back; helpers in `pg_temp`, never `public`; never DELETE a `table_seats`
  row to clean up.
- **Push a branch and STOP.** Do not open PRs by hand, do not sit watching CI.
  Checking once at the end to report a blocker is fine.
- No em dashes (U+2014) in UI text. Title Case on user-visible strings,
  acronyms upper. No emoji in source. No raw hex in `pages/horses/*.js`.
  `.maybeSingle()` never `.single()`. Mobile-first at 375px.
- If you replace behaviour a test pins, **update that test in the same commit**.
- Secrets: names only, never values.

---

## 8. ENVIRONMENT

You are on Dan's Mac if you have `mcp__counselors__host_terminal`. Then:

- `node` is not on the default PATH:
  `export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"`
- `psql` is at `/opt/homebrew/bin`. Password: `SUPABASE_DB_PASSWORD` in
  `~/Documents/club-arena/.env`. Host
  `aws-0-us-west-2.pooler.supabase.com:5432`, user
  `postgres.kuklfnapbkmacvwxktbh`.
- `gh` is not installed; use `curl` with `GITHUB_TOKEN` from
  `~/Documents/club-arena/.env`.
- The World Hub pre-push hook takes about three minutes. Launch it with
  `nohup git push ... > /tmp/push.log 2>&1 < /dev/null & disown` and poll the
  log. **Never `--no-verify`.**
- `host_terminal` kills the process group when a call times out, and long
  `sleep`s time out. Launch long jobs with
  `python3 -c "import subprocess; subprocess.Popen([...], start_new_session=True)"`.
- Rebasing your branch onto main is refused by a hook. Use
  `git merge origin/main`.
- Worktrees: World Hub `~/Documents/club-arena/.agent-trees/wh-horses`,
  workers `~/Documents/.agent-trees/workers/collusion`. Both are disposable;
  push anything you care about.

---

## 9. YOUR FIRST FIVE MINUTES

```bash
# 1. Is the detector still healthy? (this is the foundation of the whole phase)
psql "$C" -At -c "select jsonb_pretty(public.fn_ca_collusion_detector_health(30));"

# 2. What does the queue actually contain today?
psql "$C" -c "select pattern_type, status, count(*) from collusion_tracking
              where created_at > now() - interval '2 days' group by 1,2 order by 3 desc;"

# 3. Has the horse-vs-horse proportion moved since 2026-09-06?
#    (the query is in section 0 of this file)
```

If health says `live` and the mark is inside an hour of now, start at section
5 item 1. If it says `stale` for any reason **other** than
`has_unscanned_gap: true`, the detector has regressed and that comes first -
fix-first, always.
