# HANDOFF — 7-PHASE AUDIT PROGRAMME · RESUME AT **PHASE 5 OF 7**

**Written:** 2026-08-31 ~12:40 UTC · **Author:** previous Cowork/Claude session
**Status of programme:** Phases 1–4 audited & closed. **Phase 5 audit is next.**

> **READ §1 AND §2 BEFORE YOU DO ANYTHING.** §1 is how Dan wants you to work and
> he has corrected an agent on it once already. §2 is why this audit exists and
> it sets the bar for how hard you look.
>
> Every fact below was checked with a command whose output I read, at the
> timestamp above. Where something is inference rather than measurement I say so.
> §4 is a copy-paste block that re-verifies the whole world in ~30 seconds —
> run it first and tell Dan what drifted.

---

## TABLE OF CONTENTS

1. Dan's standing instructions (binding)
2. Why this audit exists — the standard you must hit
3. The full programme: what was asked, what was built, what is left
4. VERIFY BEFORE YOU TOUCH ANYTHING (copy-paste)
5. **PHASE 5 — your actual task**, with the audit checklist and known unknowns
6. Phase 6 preview (do not start it yet)
7. Phase 7 preview (do not start it yet)
8. The publish pipeline — how "merged" differs from "live"
9. BLOCKED ON DAN: the CRON_SECRET outage (highest impact open item)
10. Known holes in work I shipped (be honest about these, they are mine)
11. House rules that will bite you — each learned the hard way this session
12. Complete inventory: every PR, migration, test, and file touched
13. Verified-and-clean list (do NOT re-litigate these)
14. Backlog beyond Phase 7
15. Environment map: worktrees, credentials, tools
16. What your first reply should look like

---

## 1. DAN'S STANDING INSTRUCTIONS (BINDING)

Verbatim:

> *"NOW TAKE EVERY SINGLE THING YOU JUST SAID NEEDED TO BE DONE AND BREAK THIS
> DOWN INTO PHASES AND LET ME KNOW IN THE SUMMARY PHASE 1 OF X IS DONE, WITH THE
> SUMMARY, FOLLOWED BY READY TO START PHASE 2 OF X."*

> *"BRO NO SHOT YOU'VE DONE THEM ALL THAT FAST, YOU WERE TO TAKE THEM ONE AT A
> TIME... SMH. MAKE SURE EVERYTHING FROM THE PREVIOUS PHASE(S) WAS 100%
> COMPLETED, FINISHED EVERY STEP AND IT WAS PUSHED AND PUBLISHED, CHECK FOR ANY
> AND ALL BUGS, GAPS, STUBS, ERRORS, REGRESSIONS OR WIRING ISSUES ANYWHERE AND
> EVERYWHERE AND FIX ANY ISSUES BEFORE MOVING ONTO THE NEXT PHASE. AUDIT THEM
> ONE PHASE AT A TIME."*

Operationally, this means:

| Rule | What it means in practice |
|---|---|
| **One phase per reply** | Audit it, fix what you find, ship it, verify it landed, STOP. Do not touch the next phase in the same turn. |
| **Exact report shape** | End with `PHASE N OF 7 IS DONE` + summary, then `READY TO START PHASE N+1 OF 7`. |
| **Pushed ≠ published** | Merged to `main` is NOT live. §8 shows how to prove it. This has bitten the programme twice. |
| **Fix before advancing** | If the audit finds a defect, fix it, ship it, and confirm it merged *in the same phase*. |
| **No unverified claims** | Dan is technical and checks. If you did not read a command's output, do not assert it. |
| **Say what you checked** | If a phase is genuinely clean, list what you checked so "clean" is falsifiable. |

Dan's tone preference: direct, concrete, no padding. He responds badly to
optimistic summaries that turn out to be wrong — which is exactly what triggered
this audit.

---

## 2. WHY THIS AUDIT EXISTS — THE STANDARD

The previous session built Phases 1–6 in one burst and reported them all done.
Dan pushed back ("NO SHOT YOU'VE DONE THEM ALL THAT FAST"). The audits then
found, **in phases already reported complete and already running in production**:

| Phase | Defect found *during the audit* | Why it survived the build |
|---|---|---|
| 1 | Two of three `table_waitlist` writers didn't know the unique index had widened | Only the "main" writer was checked |
| 2 | **The alarm could never fire.** `node … \| tee` returns *tee's* exit code, so the step was always "success" — the alarm step never ran and the *recovery* step ran instead, which would have **closed a genuine issue every 30 min** | Never executed the workflow; only read it |
| 3 | **"You Are #0 In Line"** rendered live in production when a hold lapsed, then froze | The expiry path was never exercised |
| 4 | A slider drag wrote the filter row **dozens of times** to the DB | `onChange` on a continuous input wasn't considered |

**Four out of four audited phases contained a real, shipped defect.**

**The pattern, and your search heuristic:** in every case the happy path worked
and was tested. The failure was at the *edge* — expiry, a non-zero exit code, a
second writer, a continuous input. **Assume Phase 5 has one too, and go looking
at its edges specifically.** Two of the four were found only by *executing* the
thing rather than reading it. Prefer execution.

---

## 3. THE FULL PROGRAMME

### What Dan originally asked for (three features, all shipped before phases began)

1. **Table theme locked in everywhere** — *"WHAT EVER TABLE YOU HAVE SELECTED …
   TABLE, BACKGROUND, BUTTONS, CARDS SHOULD BE LOCKED IN AT EVERY TABLE ACROSS
   THE BOARD, THIS TABLE NEEDS TO SAVE AND 'CACHE'. ITS THE TABLE THAT SHOULD
   LOAD ON EVERY TABLE THROUGHOUT THE CLUB ARENA, AND AS WELL AS THE TRAINING
   GAMES PAGES AND THE PERSONAL ASSISTANT VIRTUAL SANDBOX."*
2. **60-second exclusive seat reservation** — *"WHEN YOU HAVE A SEAT RESERVED,
   AND ITS 'YOUR TURN' TO SIT DOWN. YOU SHOULD BE GIVEN 60 SECONDS TO GET TO
   THAT SEAT, AND IT NEEDS TO BE RESERVED FOR THAT PLAYER SPECIFICALLY. ANY
   NOTIFICATION CLICKED SHOULD TAKE YOU DIRECTLY TO THE PAGE, AND TO THE 'BUY IN
   SCREEN DIRECTLY'. NO OTHER PLAYER SHOULD BE ABLE TO SIT, OR TAKE THAT SEAT,
   AS ITS RESERVED FOR THE 'WAITING LIST' IN ORDER."*
3. **Filters save on click** — *"ALL FILTERS SELECTED MUST 'SAVE' WHEN CLICKED
   UNTIL CHANGED BY THE USER."*

### The seven phases (derived from "what else is left" after those shipped)

| # | Phase | Built | Audited | Result |
|---|---|---|---|---|
| 1 | Waitlist DB integrity — dup active rows + one-hold-per-player cap | ✅ | ✅ **CLOSED** | 2 defects fixed (CA #2103) |
| 2 | Cron fleet-silence alarm (would have caught the CRON_SECRET outage) | ✅ | ✅ **CLOSED** | 1 critical defect fixed (WH #1085) |
| 3 | 60-second hold countdown in the UI | ✅ | ✅ **CLOSED** | 2 defects fixed (CA #2124) |
| 4 | Cross-device lobby filters (DB truth + localStorage cache) | ✅ | ✅ **CLOSED** | 1 defect + 1 house-rule violation (CA #2140) |
| **5** | **Buttons locked in on Hub surfaces (dealer button)** | ✅ WH #1080 | ❌ **← START HERE** | — |
| 6 | Sandbox felt — one source of truth | ✅ WH #1080 (same PR) | ❌ pending | — |
| 7 | Final verification sweep across all phases | — | ❌ pending | — |

---

## 4. VERIFY BEFORE YOU TOUCH ANYTHING

```bash
export PATH=/opt/homebrew/bin:$PATH
CA=~/Documents/.agent-trees/club-arena/cowork-filters-saveclick
WH=~/Documents/.agent-trees/wh-theme-bridge

cd $CA && git fetch -q origin && echo "CA main: $(git log origin/main --oneline -1)"
cd $WH && git fetch -q origin && echo "WH main: $(git log origin/main --oneline -1)"

curl -s "https://smarter.poker/api/health?cb=$RANDOM"
curl -s "https://smarter.poker/hub/club-arena/ca-provenance.json?cb=$RANDOM"

# Is the cron fleet still dead? (see §9)
ssh -i ~/.ssh/hetzner_deploy root@178.104.160.250 \
  "journalctl -u openclaw.service --since '5 min ago' --no-pager \
   | grep -oE '\-> vercel [0-9]{3}' | sort | uniq -c"
```

Supabase MCP, project **`kuklfnapbkmacvwxktbh`**:

```sql
SELECT
  (SELECT public.fn_cron_fleet_silence(25) ->> 'silence_minutes') AS cron_silence_min,
  (SELECT public.fn_cron_fleet_silence(25) ->> 'runs_last_hour')  AS runs_last_hour,
  (SELECT max_concurrent_holds FROM public.waitlist_policy WHERE id) AS hold_cap,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='user_lobby_filters') AS filter_policies,
  (SELECT has_table_privilege('anon','public.v_spin_draw_booking_gaps','SELECT')) AS spin_leak_open;
```

### Baseline measured at 12:40 UTC — compare yours against this

| Signal | Value at handoff | Meaning if different |
|---|---|---|
| CA `main` | `a9b07c097c` | Others are merging fast; expect drift |
| WH `main` | `cd57411f71` | ditto |
| WH prod `.version` | `cd57411f` | WH was fully published at handoff |
| CA prod build | `dbddd0859dae` (11:58 UTC) | |
| `hold_cap` | `1` | Dan may have changed it — it is his knob |
| `filter_policies` | `4` | Fewer = RLS broken, investigate immediately |
| `spin_leak_open` | `false` | `true` = the anon leak reopened, treat as urgent |
| `cron_silence_min` | `48.6` | See §9 and §10.1 |
| `runs_last_hour` | `1` (normal ≈ 118) | The fleet is still dead |
| live waitlist rows | `1` | Low traffic; probes need synthetic data |
| `user_lobby_filters` rows | `0` | Nobody has saved filters since the feature published |

**Known-unpublished at handoff:** **CA #2140** (Phase 4 debounce) was merged but
**15 commits behind** the published CA build. Confirm it published before you
report Phase 4 as fully live. Everything else in §12 was published.

---

## 5. PHASE 5 — YOUR ACTUAL TASK

### 5.1 What "buttons" means here

Dan's rule names four nouns: **table, background, buttons, cards**. Three are
done and audited. **Buttons is the last one.**

Arena stores the Controls design in `user_theme_settings.button_id`. It paints
via a `data-button-theme` attribute plus
`club-arena/src/components/table/ControlThemeTokens.css`, which defines **7 CSS
custom properties per design across 10 designs**:

```
--dealer-btn-bg          --action-control-overlay
--dealer-btn-color       --action-control-inset
--action-control-radius  --action-control-letter-spacing
--action-control-border
```

### 5.2 What Phase 5 shipped (WH PR #1080, merged 10:07 UTC, PUBLISHED)

**Deliberately scoped to ONE button.** Five of the seven tokens style
Fold/Check/Raise, and **no World Hub surface has those controls** — the sandbox
table has none, and `UniversalDynamicTable`'s buttons are *quiz answers*, not
poker actions. Porting the whole sheet would have shipped five CSS variables
nothing reads: the exact *"defined 37 times, read by `var()` exactly zero times"*
defect Arena's own source comments record. So only the two tokens with a real
consumer were carried, as **data applied inline**, not as a stylesheet.

**Files and exact anchors (verified on `origin/main` at handoff):**

`WH src/lib/clubArenaTheme.js`
- `DEALER_BUTTON_STYLES` — 10 designs, `{bg, color}` copied verbatim from Arena
  including the `conic-gradient` (carbon-ion) and `radial-gradient`
  (jade-seal, amethyst-chip, ocean-pearl) values
- `PRESET_BUTTONS` — theme-preset id → Controls design id
- **line 248** `export function resolveArenaDealerButton(buttonId, themeId)`
- **line 301** `getClubArenaTheme()` now returns `buttonId` and `dealerButton`

`WH src/components/training/games/UniversalDynamicTable.jsx`
- **line 1053** `const [arenaTheme, setArenaTheme] = useState(null)` ← inside
  `LoadingSkeleton` (starts ~1405 in the pre-Prettier copy; verify)
- **line 1082** skeleton felt uses `arenaTheme.feltLayers`
- **line 1544** `const [arenaTheme, setArenaTheme] = React.useState(null)` ←
  inside `UniversalDynamicTable` (starts ~1464)
- **line 4123** villain card backs use `arenaTheme.cardBackUrl` (Phase-3-era fix)
- **lines 4207–4208** the dealer button spreads
  `{ background: arenaTheme.dealerButton.bg, color: arenaTheme.dealerButton.color }`
- **line 7167** `dealerButton: {…}` — the base style object being spread over

**What was verified when built:** all 5 resolver paths (direct `button_id`, via
preset, unknown id → `classic-white`, nothing saved → `classic-white`, conic
gradient survives intact); `arenaTheme` at 1544 is in scope at 4207;
`npx tsc --noEmit` clean for that file.

**What was NOT verified — these are your leads:**

### 5.3 Phase 5 audit checklist

1. **Is the themed button ever actually rendered?** It renders only when
   `dealerButtonSeatIndex` resolves *and* `keys[btnRel]` yields a `lawKey`
   (search `DEALER_BUTTON_SEAT_KEYS`, `DEALER_BUTTON_POSITIONS`). The previous
   session reasoned about scope but **never rendered this component**. Given §2's
   pattern — two of four defects were found only by executing — try to actually
   exercise it (Playwright MCP may be available; `/hub/training/*` and
   `pages/training-table-demo.js` are candidate routes).
2. **The duplicate `arenaTheme` state (1053 vs 1544).** Two states, two
   `onClubArenaThemeChange` subscriptions per mount. Check: can the skeleton's
   felt and the live table's button *disagree* mid-transition? Is two storage
   listeners per table acceptable when several tables mount?
3. **Diff `PRESET_BUTTONS` against Arena's real catalog.** It was hand-derived
   from `THEME_PRESET_CATALOG` in `club-arena/src/lib/tableTheme.ts`. A wrong
   mapping silently paints the wrong button — no error, no test. Arena's truth:
   ```
   default-dark→classic-white   classic-brown→gray-d-gear   neon-blue→blue-crystal
   rustic-wood→gold-star        casino-green→gold-star      ocean-depths→classic-white
   crimson-club→red-d-gear      arctic-suite→ocean-pearl    amethyst-night→amethyst-chip
   carbon-ion→carbon-ion
   ```
   Also check the **legacy aliases** — `PRESET_SKINS` carries `neon`,
   `midnight_casino`, `cosmic`, `midnight_felt`, `midnight_a`, `royal_gold`,
   `royal_b`. **Does `PRESET_BUTTONS` carry them too?** If not, a player holding
   a legacy receipt gets the right felt and the *default* button. I believe this
   is a real gap but did not confirm it — **check it first**.
4. **No drift guard exists for buttons.** `WH __tests__/arena-theme-assets-exist.test.mjs`
   (4 tests) guards skin / background / card-back *artwork*. It does **not**
   guard `DEALER_BUTTON_STYLES` or `PRESET_BUTTONS`. Extend it: every
   `DEALER_BUTTON_STYLES` key must exist in Arena's `ControlThemeTokens.css`, and
   every `PRESET_BUTTONS` value must be a real design id. Verify the new test
   **fails** if you delete a key.
5. **Confirm WH #1080 is published** (§8). It was at handoff; re-check.
6. **Question for Dan, do not decide alone:** the other five control tokens stay
   unported because nothing consumes them. If Dan wants Fold/Check/Raise themed
   on the training surfaces, that is a **restyle of those UIs** — a design
   decision. Surface it; don't silently redesign his training screens.

---

## 6. PHASE 6 PREVIEW — sandbox felt (DO NOT START YET)

Shipped in the same PR (WH #1080). The sandbox had its *own* felt picker
(`FELT_COLORS` → localStorage `sandbox-felt` → `saveAppSetting('sandbox_felt')`)
applying a **`hue-rotate` filter over the whole table wrapper**. Once
`SandboxPokerTable` began painting the Arena felt underneath, that filter stopped
*choosing* a colour and started **distorting** the chosen one — Crimson + "Green"
renders as hue-rotated crimson, which is neither.

Fix shipped: the legacy tint stands down while an Arena theme is active, and the
picker **dims, disables, and explains** rather than silently ignoring taps.

Anchors (`WH pages/hub/personal-assistant/sandbox.js`): line **624**
`arenaThemeActive = false` prop; **845–851** disabled/cursor/opacity; **859–861**
the explanatory caption; **2913** `arenaTheme?.fromCache` on the page backdrop.

Audit leads: does `arenaThemeActive` actually reach `SetupSheet` in every render
path? What happens for a logged-out user (`fromCache` false → legacy picker
active — is that right)? Is `saveAppSetting('sandbox_felt')` now writing a
setting nothing reads?

---

## 7. PHASE 7 PREVIEW — final sweep (DO NOT START YET)

Re-verify all six phases in production simultaneously: every migration applied
and mirrored, every PR published, all test suites green, no regressions between
phases, and a clear statement of what remains blocked on Dan (§9).

---

## 8. PUBLISH PIPELINE — "MERGED" IS NOT "LIVE"

Two apps, two answers.

**World Hub (Next.js):** `main` → Vercel git integration → `smarter.poker`
```bash
curl -s "https://smarter.poker/api/health?cb=$RANDOM"   # .version = short WH sha
```

**Club Arena (Vite SPA):** CA `main` → GH Action `build-for-world-hub.yml` →
commits a built bundle into WH → Vercel publishes WH
```bash
curl -s "https://smarter.poker/hub/club-arena/ca-provenance.json?cb=$RANDOM"
# .commit = the CA commit whose bundle is live
```

**Prove a specific CA PR is live:**
```bash
cd $CA
PUB=$(curl -s "https://smarter.poker/hub/club-arena/ca-provenance.json?cb=$RANDOM" \
      | python3 -c "import sys,json;print(json.load(sys.stdin)['commit'])")
M=$(gh pr view <PR> --json mergeCommit -q '.mergeCommit.oid')
git merge-base --is-ancestor "$M" "$PUB" && echo PUBLISHED || echo "not yet"
```

**Lag is normal, not a stall.** `build-for-world-hub.yml` uses
`cancel-in-progress`, so rapid merges supersede each other. I observed a
**10–15 commit backlog** and runs cancelling repeatedly. Confirm *movement*
rather than assuming a stall: watch `.commit` change, or
`git log origin/main --grep="sync build"` in WH. I watched it advance
`19b3c5bd → 7ceaf569 → dbddd085` during the audits.

**A red client test blocks the sync for the whole estate** (CLAUDE.md §5 rule 8)
— so never push a failing test.

---

## 9. BLOCKED ON DAN — CRON_SECRET MISMATCH (HIGHEST IMPACT OPEN ITEM)

Production's `CRON_SECRET` was rotated; the Hetzner Open Claw VM was never
updated. **All 85 scheduled jobs return 401.** Still live at handoff: 16×
`-> vercel 401` in 4 minutes, `runs_last_hour = 1` against a norm of ~118.

**Dead while this persists:** `push-dispatch` (all player push notifications),
`anti-cheat-bot-timing`, `anti-cheat-chip-dump`, `anti-cheat-multi-account`,
`collusion-scan`, `chip-supply-snapshot`, `spin-sweep`, `bbj-detect`,
`tournament-bounty-detect`, `live-reminders`, `venue-game-alerts`,
`license-reminders`, and **`waitlist-sweep`**.

**Consequence for Phase 1 you must understand:** the waitlist queue only advances
when somebody cashes out, because the per-minute sweep that also advances it is
401ing. Phase 1 works; its *trigger* is dead.

**Diagnosis is complete and airtight** (in `WH .agent/handoffs/2026-08-31-cron-secret-mismatch-openclaw-401.md`):
- production **has** a secret configured — `validateCronAuth` *throws* (→500) when
  unset, and we get the handler's own **401**, so it is set and simply differs
- the auth code is unchanged
- not Vercel Deployment Protection (that returns HTML, we get our JSON)
- reproduced **6/6** from the VM's own env
- the VM sends `/etc/openclaw.env` (systemd `EnvironmentFile`), fingerprint
  `5eb74390bc5b`

**Why no agent can finish it:** reading the current production secret needs the
Vercel CLI, whose token is **also rejected** (`vercel whoami` → "token is not
valid" — plausibly the same rotation), and the Vercel MCP exposes no env-read
tool. RULE 0 credential exception.

**Trap for whoever fixes it:** `/opt/openclaw/.env` holds a **different**
`CRON_SECRET` (fingerprint `dcce68dd475f`). Inert today (systemd loads
`/etc/openclaw.env`) but it will mislead a hand-debugger. Reconcile or delete it.

**Alarm issue WH #1088** is open — a TRUE alarm raised by the Phase 2 watchdog.
It self-closes once the fleet records runs again.

---

## 10. KNOWN HOLES IN WORK I SHIPPED (MINE — DO NOT LET THESE SLIDE)

### 10.1 `fn_cron_fleet_silence` can be masked by ONE surviving job
The fleet verdict uses **the newest row across ALL jobs**. At 11:31 a single job
(`/cron/daily-challenges`, probably triggered outside Open Claw) recorded one
run and **reset the silence clock from 96 min to ~41**, while 84 jobs stayed
dead. So one survivor masks a fleet-wide outage for up to the 25-min threshold.

`late_jobs` still tells the truth (it correctly showed `hard-stop` quiet 194 min
against a 1-min cadence; `collusion-scan` 223 vs 30; `chip-supply-snapshot` 253
vs 60). **Suggested fix, not built:** also alarm when `runs_last_hour` collapses
against its own trailing baseline (currently `1` where normal ≈ 118).

### 10.2 `solver-watchdog` noise in `late_jobs`
Retired 2026-08-27 but still listed until 14 days of history age out.
Self-heals ~2026-09-10. Cosmetic.

### 10.3 Legacy preset aliases may be missing from `PRESET_BUTTONS`
See §5.3.3. Suspected, unconfirmed — **verify in the Phase 5 audit**.

### 10.4 The debounce constant is a guess
`REMOTE_SYNC_DEBOUNCE_MS = 700` (Phase 4). Chosen to swallow a drag while
staying responsive; **not measured against real input timing**. The unmount
flush makes a too-long value safe, so this is low risk — but it is a guess.

---

## 11. HOUSE RULES THAT WILL BITE YOU

1. **NEVER work in the shared clones** `~/Documents/club-arena` or
   `~/Documents/Smarter-Poker-World-Hub`. Hooks refuse commits/pushes, and an
   Antigravity `git reset --hard origin/main` loop destroys uncommitted work.
   Use the worktrees (§15). `AGENT_SHARED_CLONE_OK=1` exists — **don't**.
2. **Never copy whole files between shared clone and worktree.** Husky runs
   Prettier on commit in the shared clone, so its files are reformatted vs
   `main`. I did this once → **10,000-line diff**. Re-applying only my hunks
   gave 31 lines. Correct method: `git checkout origin/main -- <file>` in the
   worktree, then apply hunks there (a small Python script with `assert
   s.count(old)==1` is reliable and fails loudly when an anchor drifts).
3. **`main` is protected.** Branch → PR → `gh pr merge --squash --auto`.
4. **Source-reading tests must NOT bound windows by byte count.** Use
   `tests/helpers/sourceWindow.ts` — `sliceMethod`, `sliceStatement`,
   `sliceEnclosingBlock`, `sliceCall`, `sliceCssRule`, `sliceYamlBlock`,
   `sliceYamlEntry`, `sliceSqlStatement`, `sliceDollarQuoted`, `sliceBetween`.
   `tests/unit/noFixedSizeSourceWindows.test.ts` enforces it and **failed my
   commit**. The reason is real: a byte-count window drifted off the code it
   guarded and cost a **39-minute publish outage** for the whole estate.
5. **Never spend real chips to test a rule** (CLAUDE.md 11.5). Probe money paths
   inside a transaction you **roll back**. `GET STACKED DIAGNOSTICS` survives
   rollback. **Steal this pattern** for returning values out of a rolled-back
   `DO` block:
   ```sql
   RAISE EXCEPTION 'AUDIT| step3=% | step4=%', v_step3, v_step4;
   ```
6. **New tables/columns must be added to BOTH manifests**, or CI claims your
   applied migration was never applied:
   `scripts/ci/supabase-columns-manifest.json` **and**
   `scripts/ci/supabase-schema-manifest.json`. Verify:
   `node scripts/ci/check-migrations-applied.mjs origin/main`. This cost me a
   red CI run on the very first phase.
7. **A "Fact-Forcing Gate" hook blocks Edit/Write.** It demands four facts:
   importers (via Grep), affected functions, data shapes, and Dan's instruction
   verbatim. State them in your message, then retry the *identical* call.
8. **GitHub API rate limits are reachable.** `gh run list` started 403ing after
   heavy polling. Fall back to `git log origin/main --grep=...` and `curl`
   against production.
9. **RPC probes that "pass" may prove nothing.** My first exclusivity test was
   refused for *"Buy-in below table minimum"* — it never reached my guard.
   Always confirm the refusal reason is *the one you are testing*.
10. **Seat-hold exclusivity is only observable on a nearly-full table.** The
    guard is `seats_taken + holds >= max_players`. With 8 free seats, letting
    someone else sit is CORRECT. Use a 2-seat table with 1 filled.
    `fn_tables_autostart_guard` forbids `max_players < auto_start_players`, so
    set both; and `DELETE FROM table_seats WHERE table_id=…` **without**
    `left_at IS NULL`, or the `(table_id, seat_number)` unique key blocks reuse.
11. **No emoji in source.** Popups Title Case, no em dashes. Horses are players,
    never "bots" (CLAUDE.md 10.5).
12. Migrations go through the **Supabase MCP `apply_migration`**, then the same
    SQL is mirrored into `supabase/migrations/`.
13. **Long waits:** `sleep` in the sandbox caps ~178s; the host terminal times
    out around 120s. Poll in chunks.

---

## 12. COMPLETE INVENTORY

### Club Arena PRs (all MERGED)
| PR | Merged UTC | What |
|---|---|---|
| #2007 | 00:48 | Filters persist on every click, not only Apply |
| #2014 | 08:17 | 60s exclusive seat hold + `?buyin=1` deep link |
| #2071 | 09:17 | **SECURITY**: spin reconciliation views closed to anon |
| #2079 | 09:44 | P1 build — waitlist integrity |
| #2090 | 10:03 | P3 build — hold countdown |
| #2093 | 10:08 | P4 build — cross-device filters |
| #2103 | 10:30 | **P1 audit fix** — the other two waitlist writers |
| #2124 | 11:11 | **P3 audit fix** — "You Are #0 In Line" |
| #2140 | 12:10 | **P4 audit fix** — slider write storm (⚠ not yet published) |

### World Hub PRs
| PR | Merged UTC | What |
|---|---|---|
| #1053 | 01:09 | Theme bridge + artwork → training tables & sandbox |
| #1070 | 08:56 | Sweep advances the queue; cadence `*/10`→`*/1`; dispatcher deployed |
| #1075 | 09:16 | CRON_SECRET incident handoff |
| #1076 | 09:30 | Training tables paint the player's card back |
| #1078 | 09:54 | P2 build — cron fleet-silence alarm |
| #1080 | 10:07 | **P5 + P6 build** — dealer button + sandbox felt |
| #1085 | 10:46 | **P2 audit fix** — PIPESTATUS; alarm could never fire |
| #1098 | **OPEN** | This handoff |

### Migrations applied to production (all mirrored into `CA supabase/migrations/`)
1. `20260831010000_sixty_second_exclusive_seat_hold.sql`
2. `sweep_honours_the_sixty_second_hold_and_advances_the_queue` (WH-side work)
3. `fn_cron_fleet_silence_detects_a_dead_fleet`
4. `cron_fleet_silence_judges_each_job_by_its_own_cadence`
5. `20260831120000_spin_reconciliation_views_are_not_a_public_api.sql`
6. `20260831130000_waitlist_one_active_row_and_one_live_hold.sql`
7. `20260831140000_lobby_filters_follow_the_player.sql`

Live signatures at handoff:
`fn_offer_open_seat(p_table_id uuid, p_offer_ttl interval DEFAULT '00:01:00', p_entry_ttl interval DEFAULT '24:00:00')`
`fn_sweep_stale_waitlists(p_offer_ttl interval DEFAULT '00:01:00', p_entry_ttl interval DEFAULT '24:00:00')`

### Tests added (all on `main`, all green)
| File | Tests | Guards |
|---|---|---|
| `CA tests/unit/seatHoldCountdown.test.ts` | 9 | countdown arithmetic; the `#0` expiry defect |
| `CA tests/unit/lobbyFiltersCrossDevice.test.ts` | 7 | `sanitizeStore` door; the touchedRef invariant |
| `CA tests/unit/waitlistWritePaths.test.ts` | 4 | all three `table_waitlist` writers |
| `CA tests/unit/filterRemoteSyncDebounce.test.ts` | 5 | debounce collapse + unmount flush |
| `WH __tests__/arena-theme-assets-exist.test.mjs` | 4 | theme artwork exists (**not** buttons — §5.3.4) |

Run them: `cd $CA && npx vitest run tests/unit/<file>`
**Every one was verified to FAIL against the unfixed code.** Do the same.

### New DB objects
- `table_waitlist.hold_expires_at` (timestamptz)
- `waitlist_policy` — single row, `max_concurrent_holds` (default **1**, Dan's knob)
- `user_lobby_filters` — `(user_id, club_id)` PK, `filters jsonb`, RLS 4 policies
- `fn_cron_fleet_silence(int)` — service_role only
- Index `table_waitlist_one_active_per_player_uidx` on
  `(table_id, user_id) WHERE status IN ('waiting','notified')`

---

## 13. VERIFIED-AND-CLEAN — DO NOT RE-LITIGATE

- **RLS on `user_lobby_filters` genuinely enforces ownership.** Impersonated
  `authenticated` with a real JWT claim: player A wrote their own row, affected
  **0** of B's rows, read **0** of B's rows.
- **Seat-hold exclusivity proven end-to-end.** Offer made → `hold_expires_at`
  written → another player refused with **`SEAT_RESERVED`** → the **holder** not
  refused by their own hold.
- **A capped head-of-queue does NOT block the queue** — the seat passes to the
  next player (this was the single biggest risk in Phase 1).
- **Money-path SECURITY DEFINER functions are gated.** The one suspicious hit,
  `ca_union_record_presettlement`, derives its actor via `ca_can_oversee_union()`
  → `auth.uid()`. False positive.
- **No other ops/financial view is anon-readable** (swept by name pattern).
- `training_leaderboard_top` anon-readable **by design** (rank, accuracy,
  streaks). Not a leak.
- `spatial_ref_sys` RLS advisor ERROR is PostGIS reference data — false positive.
- The `auto-settlement` / `rakeback-period-settle` jobs quiet for 7 days are
  **weekly Monday-10:00 jobs**, not broken.

---

## 14. BACKLOG BEYOND PHASE 7

1. Fold/Check/Raise theming on Hub surfaces — needs Dan's design decision (§5.3.6)
2. `fn_cron_fleet_silence` single-job masking (§10.1)
3. `solver-watchdog` `late_jobs` noise — self-heals ~2026-09-10
4. `WaitlistManager` hard-DELETEs waitlist rows (`handleLeave`,
   `handleSeatPlayer`, `handleRemove`) instead of setting a status — loses audit
   trail. **Pre-existing, not introduced here.**
5. `public.wallets` frozen with 732,591,994.33 chips, nothing reads it. Any money
   path writing there is broken (CLAUDE.md 11.5).
6. Extensions in `public` (postgis, pg_trgm, vector, **dblink**, plpgsql_check) —
   advisor warnings; `dblink` is the notable one.
7. **647 SECURITY DEFINER functions executable by `authenticated`** — only the
   money-named subset was audited. Large unswept surface.
8. Filters have no cross-device *conflict* resolution — last write wins. Fine for
   a preference; note it if Dan ever wants merge semantics.

---

## 15. ENVIRONMENT MAP

**Worktrees (use these, never the shared clones):**
```
CA: ~/Documents/.agent-trees/club-arena/cowork-filters-saveclick
    (at handoff: branch fix/p4-filter-write-storm, clean)
WH: ~/Documents/.agent-trees/wh-theme-bridge
    (at handoff: branch docs/phase-audit-handoff, clean)
```
Start each phase with `git fetch -q origin && git checkout -q -B <new-branch> origin/main`.

**Infrastructure:** Supabase `kuklfnapbkmacvwxktbh` · Vercel project
`hub-vanguard` (`prj_op66GkZyZcygXQKm76iyycfVFAQx`) · Open Claw VM
`root@178.104.160.250` key `~/.ssh/hetzner_deploy` (dispatcher at
`/opt/openclaw/dispatcher.py`, env `/etc/openclaw.env`, deploy via
`WH scripts/deploy-openclaw.sh`).

**Tooling notes:** `export PATH=/opt/homebrew/bin:$PATH` first — `node` is not on
the host terminal's default PATH and hooks fail with `env: node: No such file`.
Supabase MCP works well. Vercel CLI token is **invalid**. GitHub MCP available;
`gh` works until rate-limited.

---

## 16. WHAT YOUR FIRST REPLY SHOULD LOOK LIKE

1. Run §4. State plainly what drifted from the baseline table.
2. Confirm whether **CA #2140** finally published (§4, "Known-unpublished").
3. Audit **Phase 5 only**, using §5.3 — and look for what is *not* on that list.
   Start with §5.3.3 (legacy aliases in `PRESET_BUTTONS`); I suspect a real gap.
4. Fix everything found, in a branch off `origin/main` in `$WH`, with tests you
   have **verified fail against the unfixed code**.
5. Confirm merged **and published** (§8).
6. Report: **`PHASE 5 OF 7 IS DONE`** + what you found and fixed — or, if
   genuinely clean, exactly what you checked so the claim is falsifiable — then
   **`READY TO START PHASE 6 OF 7`**. Then stop.

**Do not** start Phase 6 in the same turn. Dan has corrected an agent on this
once; do not be the second.
