**Non-engine delivery: push, publish, verify and finish without waiting for `:55`.** Apply the maintenance cutover only to an actual engine replacement or a specifically identified dependency on new engine behavior. A Club Arena client using existing engine APIs, an unrelated pending engine release, and a generic engine-health check do not create that dependency. Required checks and normal client publication/live proof still apply.

> **Current owner instruction (September 17):** Use [PUBLISHING.md](PUBLISHING.md) for the active push, protected merge, publication and live-verification procedure. Each authorized agent owns its delivery independently and may work and publish in parallel. There is no restoration-owner approval or numbered release queue. This later owner instruction supersedes conflicting historical release directions below. Retired local/custom publishers, autopilot, watchdog/repair release paths and external error telemetry remain inactive. Preserve required technical checks, production safeguards and other agents’ work.

# Smarter-Poker-World-Hub -- Agent Instructions

## ↗ START HERE: current operating references

Read root `AGENTS.md`, `AGENT-PLAYBOOK.md` and `docs/agent-policy/REFERENCE-INDEX.md` at task start and every resumption. They link to the current owner policy, operating law and hardening standard. Read `PUBLISHING.md` for delivery. Later owner instructions govern operating authority; the product and financial laws below remain applicable within the assigned scope. Historical programmes are not automatic assignments.

Use the task’s existing handoff for continuity. Do not assume a reset loop is present or authorize one. An inaccessible credential or provider is a specific evidence gap, not permission to bypass safeguards or claim success. The platform upgrade plan is historical scope/dependency context, not authority above the current owner policy.

## 1. DEPLOYMENT PIPELINE (read this FIRST)

There is exactly ONE deployment path. No exceptions. No alternatives.

### 1.1 Infrastructure

| Service    | Purpose                          | Project ID / URL                                   |
|------------|----------------------------------|-----------------------------------------------------|
| Vercel     | Frontend hosting (smarter.poker) | `hub-vanguard` / `prj_op66GkZyZcygXQKm76iyycfVFAQx` |
| Supabase   | Database + Auth + Realtime       | `kuklfnapbkmacvwxktbh.supabase.co`                  |
| Hetzner    | Poker engine server (Node.js)    | `server/` directory, deployed via SSH               |

**Canonical Vercel project for this repo: `hub-vanguard` ONLY.** Never re-link this
GitHub repo (`Smarter-Poker-World-Hub`) to any other Vercel project. Doing so
fires a duplicate build on every push, and the duplicate's queue starves the
real one — the symptom is "deployments queued forever, never build" in the
Vercel dashboard.

Known dead duplicates (do NOT touch, do NOT re-link):
| Project name              | Project ID                                | Why it's dead |
|---------------------------|-------------------------------------------|---------------|
| `smarter-poker`           | `prj_FNUaJmcjRnwCSh1JzblIUYuOXDGK`        | Disconnected, hooks deleted |
| `smarter-poker-world-hub` | `prj_PGNqOQZSSWwWx7p86leBf5YTOWEU`        | 2026-05-08: deleted after duplicate-builds incident — see `.agent/audits/2026-05-08-vercel-duplicate-project-incident.md` |

If you find a NEW Vercel project linked to this repo, it's a regression of
this exact bug — disconnect/delete it. Run
`scripts/check-vercel-project-uniqueness.mjs` to verify exactly one project
serves this repo at any time.

### 1.1.1 No new infra, ever — write to the canonical place (RULE 12)

Agents are FORBIDDEN from creating new GitHub repos, Vercel projects,
Supabase projects, Hetzner servers, OAuth clients, or any parallel
infrastructure. Every smarter.poker workload has exactly one canonical
home and that's where agents write. See RULE 12 in
`.agent/CLAUDE_AGENT_RULES.md` for the full canonical-homes table and
forbidden-actions list.

Quick rule: if you're about to run `gh repo create`, click Vercel
"Import Project", create a second Supabase project "for X", or make a
second OAuth client in any provider's console — STOP. The existing
canonical thing is what you write into. Resolve the assigned requirement in its canonical home; do not create parallel infrastructure as a delivery workaround.

### 1.2 Assigned database changes and maintenance

Only assigned database changes require migrations. Follow `.agent/workflows/migration-safety.md`, use the maintained naming/installation path, qualify compatibility, and verify the exact installed history and readback. Neither SQL-first nor SQL-last is a universal rule. Never replay an installed migration. The database safety requirements remain:

**NO DDL IN THE HOURLY BREAK WINDOW, :50-:03 UTC (2026-09-10, BINDING).**
   The database is shared with Club Arena, so its hourly maintenance break
   binds here: :53 announce, :55 freeze, ~:57 engine restart, :00 thaw
   (Club Arena CLAUDE.md section 13). A migration at 23:52 UTC on 2026-09-09
   cancelled the 00:00 break, so the database now enforces the window
   itself. Event triggers `ca_break_window_refuses_ddl` (ddl_command_end)
   and `ca_break_window_refuses_drops` (sql_drop) roll back the whole
   transaction of any non-temporary DDL run in the window from a `postgres`
   login or a member of it - the Supabase MCP's `apply_migration` and
   `execute_sql`, the CLI, psql, the dashboard. The window test is
   `fn_ca_break_window_refuses_migrations(p_at)` (NULL outside it), the
   session test `fn_ca_break_window_governs(role, app)`. pg_cron,
   `supabase_admin` and Supabase's other internal roles, PostgREST
   (`authenticator`/`service_role`) and temporary objects are not covered.
   A refused migration applied nothing and wrote no history row: check
   `date -u` and apply it ONCE after :03, never in a retry loop. An
   emergency fix that cannot wait puts
   `SET LOCAL ca.break_window_migration_override = '<why this cannot wait>';`
   right after its `BEGIN;` - a reason, not a switch (blank, on/off,
   true/false and the like are refused), honoured for that one transaction
   and logged in `public.ca_break_window_migration_overrides`. Never disable
   the triggers. Every MCP `list_migrations` and `apply_migration` call
   first runs no-op `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on the
   history table, which reloads PostgREST (~28 s) and is refused inside the
   window. To see what is applied, at any minute, run this through
   `execute_sql` instead:
   `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC`.
   A refusal's HINT cites Club Arena CLAUDE.md, Production DDL policy rule
   8: it is this rule. Reasoning: Club Arena
   `docs/changelog/2026-09-10-the-database-refuses-migrations-inside-the-break-window.md`.

### 1.3 Push, merge and publication

Use normal Git in an owned worktree and the configured authenticated GitHub
CLI/API, following [PUBLISHING.md](PUBLISHING.md). Preserve hooks and required
checks. Find the existing PR before creating one; the authorized agent completes
the protected squash merge without waiting for another workstream.

The protected main merge triggers Vercel's Git integration on `hub-vanguard`.
Vercel builds from source and automatically publishes production. Do not use
retired shared-clone scripts, a local/prebuilt deployment, a deploy hook or a
second Vercel project. Club Arena publishes through its own GitHub/Hetzner route.

### 1.4 Verify the actual publication

Record the Vercel production deployment ID, READY result and selected Git
revision. Confirm `https://smarter.poker/api/health` reports that revision and
verify the affected behavior. If concurrent merges supersede a deployment,
prove the actual live revision contains your change. A push, merge or healthy
endpoint alone does not prove the assigned behavior is delivered.

### 1.5 Handle an actual failure

Read the owning GitHub/Vercel failure, compare with the last successful
same-category result, and make the smallest correct fix. Preserve valid evidence;
do not repeatedly rerun unchanged failures or duplicate successful checks.
Record pending run/revision identities and continue other authorized work while
providers run. No deploy-autofix endpoint, watchdog, scheduled repair or
background push service may repair, advance or certify a release.

---

## 2. PRE-PUSH CHECKS (enforced automatically)

### 2.1 Required checks and source builds

Keep ordinary hooks and the applicable existing required GitHub checks. Vercel
performs the production source build through its Git integration. The retired
shared-clone local-build script and its skip flags are not the active route.

### 2.2 GitHub Actions Safety Gate

`.github/workflows/build-safety-gate.yml` runs on every push to main:
- CHECK 1: No `.single()` calls (must use `.maybeSingle()`)
- CHECK 2: No unused React hook imports
- CHECK 3: No raw `@supabase/supabase-js` imports in API routes
- CHECK 4: No merge conflict markers in source files
- CHECK 5: TypeScript compilation (advisory, does not block)
- CHECK 15: Commit author resolves to a GitHub user (RULE 3). Vercel will not
  build a commit it cannot attribute — the deployment goes to **BLOCKED** with
  no build logs at all, so nothing else in this gate can see it and the only
  symptom is a red row in the Vercel dashboard. Added 2026-08-19 after five
  production deployments were blocked in one afternoon, every one of them
  authored `Claude (Cowork) <...@gmail.com>`. Commits must be authored
  `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` or
  `github-actions[bot]`.

Has `cancel-in-progress: true` so rapid pushes don't queue 15 stale builds.

### 2.3 Secret Scanning (Phase 0)

Blocks push if any file contains `ghp_` or `github_pat_` patterns.
GitHub auto-revokes leaked tokens. This gate prevents that.

### 2.4 Protected Zone Enforcement (Phase 0.5)

`public/hub/club-arena/` was a protected zone. It is now something stronger:
**the directory is DELETED and must never come back.** Club Arena moved to its
own origin on 2026-09-02 and is reached from here by a single Next.js rewrite
(see the Club Arena section below). Next serves `public/` BEFORE `afterFiles`
rewrites, so a file re-vendored there does not merely duplicate the bundle - it
silently SHADOWS the live one, and the site keeps serving whatever was last
committed. `tests/club-arena-is-a-rewrite.test.mjs` fails CI if the directory
or its retired sync scripts return.

---

## 3. CODE SAFETY RULES (8 Immutable Rules)

Preserve these code-safety rules and verify applicable enforcement. A violation requires diagnosis and correction through the protected route; do not infer that an automatic rollback occurred.

1. **No `.single()`** -- Always `.maybeSingle()`. `.single()` throws PGRST116 on 0 rows.

2. **No unused hook imports** -- If you `import { useXxx }`, you MUST call `useXxx()`.
   Unused hooks cause ReferenceError during SSG, crashing the entire build.

3. **No module-scope `createClient()`** without `typeof window` guard.
   Module-scope runs during SSG where browser APIs don't exist.

4. **No raw `@supabase/supabase-js` in API routes** -- Use `src/lib/supabaseServerClient`.
   The patched client has JWT decode fallback. Raw imports bypass GoTrue resilience.

5. **No trusting `req.query.userId`** for identity -- Use JWT via `supabase.auth.getUser(token)`.
   Query params are an IDOR attack vector.

6. **No `.limit()` on JavaScript arrays** -- `.limit()` is a Supabase query builder method.

7. **No emoji in source files** -- No emoji in JSX, string literals, props, toast messages,
   admin panels, or any user-facing string. Use plain text or Unicode symbols.
   Bare emoji break the SWC compiler and cause Vercel build failures.

8. **Verify every change** before claiming done (see Section 5: Verification Protocol).

---

## 4. TASK CLASSIFICATION

Classify your task BEFORE starting. This determines your workflow.

### Tier 1: Quick Fix (5-10 min)
CSS bugs, text changes, single-file edits where you know the file.
Workflow: Fix it. Follow [PUBLISHING.md](PUBLISHING.md). Report what changed.

### Tier 2: Feature Work (15-30 min)
Multi-file edits, new UI elements, logic bug fixes.
Workflow: State approach in 3 lines. Execute. Follow [PUBLISHING.md](PUBLISHING.md). Report.

### Tier 3: Architecture (30+ min)
Database migrations, new API routes, cross-component refactors, auth/payment changes.
Workflow: Record a scoped implementation plan. Execute work already authorized; ask only for a material decision outside that authority. Verify and follow PUBLISHING.md through delivery.

For Tier 1-2: Do NOT read Knowledge Items, skills, or workflows.
For Tier 3: Read the current owner policy, operating law, hardening standard and scoped references in `docs/agent-policy/REFERENCE-INDEX.md`. Historical memory notes do not override those maintained instructions.

---

## 5. VERIFICATION PROTOCOL

### Tier 1 (CSS/Layout)
1. Make the fix
2. Follow [PUBLISHING.md](PUBLISHING.md) through required checks, protected merge and verified Vercel publication
3. Report what changed

### Tier 2 (Logic Changes)
1. Follow [PUBLISHING.md](PUBLISHING.md)
2. Run the relevant checks and verify the affected behavior with evidence.
3. Use configured authorized test access when browser verification is required, then report the actual result.

### Tier 3 (Architecture)
1. Run `npm run build` locally first
2. Browser-test all affected features
3. Run the 8 Immutable Rules grep checks
4. Follow [PUBLISHING.md](PUBLISHING.md)
5. Verify deployment via Vercel MCP or dashboard

### Test Account
Use the configured authorized service/test identity through its owning client. Never assume Dan's personal account is a test account, read environment-file values or print credentials. Necessary assigned secret repairs follow the current owner policy. Establish actual access before a required signed-in check.

---

## 6. FILE MAP

### World Hub (Next.js)
```
pages/hub/              World Hub pages
pages/api/              API routes (300+)
pages/commander/        Club Commander staff UI
pages/hub/commander/    Club Commander player UI
src/components/         Shared React components
src/lib/                Shared libraries
src/stores/             Zustand stores
```

### Club Arena (Vite SPA -- separate repo)
```
Source:     Smarter-Poker-Club-Arena repo (~/Documents/club-arena/src/)
Output:     https://ca-static.smarter.poker  -- its OWN origin, NOT this repo.
            /srv/club-arena on the Hetzner box: releases/<ca_sha>/, an
            atomically swapped `current` symlink, an additive pool/.
Serving:    ONE rewrite in next.config.js afterFiles:
              /hub/club-arena/:path*  ->  https://ca-static.smarter.poker/:path*
            The browser never sees the origin hostname, so the shared
            smarter-poker-auth session is untouched. Nothing to sync here.
API:        pages/api/club-arena/   (still lives in this repo)
Rebuild:    You do not. Push a branch in the Club Arena repo; its
            publish-club-arena.yml rsyncs the bundle to the origin.
Auth:       Same-origin Supabase session via smarter-poker-auth localStorage key
```

### Club Commander
```
Staff UI:       pages/commander/
Player UI:      pages/hub/commander/
API:            pages/api/commander/
Components:     src/components/commander/
State:          src/stores/commanderStore.js
Schema:         .agent/skills/club-commander/DATABASE_SCHEMA.sql
```

Stay in your scoped area. If your task is Commander, don't touch Club Arena files.

---

## 7. AGENT ISOLATION (concurrent work)

### File-Level Ownership
- Identify the specific files you will modify at task start
- Do not modify files another agent is likely editing
- Report any shared-file edits

### Protected Zones
`public/hub/club-arena/` -- DELETED 2026-09-02, never re-create it (see 2.4)
`pages/api/club-arena/` -- Club Arena agents only

How to know if you're a Club Arena agent: your task mentions "Club Arena", "poker table",
"club-arena", or references `~/Documents/club-arena/`.

### Shared Resources -- Do Not Touch
- `rm -rf .next` -- kills all agents' compilations
- `npm run build` -- blocks dev server for minutes
- `npm install` -- modifies node_modules mid-compilation
- Dev server restart -- wait 10s, another agent may be restarting

### Git Conflict Safety
After protected merge and provider publication, verify your changes survived.
If the script reports "Accepting remote changes" during rebase, your changes
may have been overwritten. Re-apply them and re-run the script.

---

## 8. COMMON BUG PATTERNS

| Symptom | Cause | Fix |
|---------|-------|-----|
| `.single()` crash (PGRST116) | Query returned 0 rows | Replace with `.maybeSingle()` |
| Build fails with "Unexpected character" | Bare emoji in JSX | Wrap in `{'emoji'}` or remove |
| "Loading..." hangs forever | Query param mismatch (`?club` vs `?club_id`) | Align URL params |
| Server 500 on page load | Corrupted `.next` cache | `rm -rf .next && npm run dev` |
| "Cannot find module vendor-chunks" | `.next` corruption | `rm -rf .next && npm run dev` |
| Page works for admin only | Hardcoded user ID | Check role/ID conditionals |
| Styles not updating | Browser cache / Vercel CDN | Hard refresh, check incognito |
| Unused hook ReferenceError | Hook imported but not called | Remove unused import or call it |
| Merge conflict markers in source | Bad rebase resolution | `grep -rn "^<<<<<<< " src/ pages/` and fix |

---

## 9. PROJECT DETAILS

**Stack:** Next.js 14 (Pages Router), React 18, Supabase (PostgreSQL + Auth + Realtime),
Tailwind CSS + DaisyUI, Zustand.

**Auth:** Same-origin Supabase via `smarter-poker-auth` localStorage key.
User logs into smarter.poker, all sub-apps share the session.

**Production URL:** `https://smarter.poker`
**Club Arena URL:** `https://smarter.poker/hub/club-arena/`

### Club Commander Rules
- No emoji. Clean professional UI.
- Facebook color scheme: Primary #1877F2, Background #F9FAFB
- Inter font for all text
- Check DATABASE_SCHEMA.sql before creating/modifying tables
- Check API_REFERENCE.md before creating/modifying endpoints

---

## 10. WORKING RULES (set by Dan, binding on all agents)

1. One step at a time. Finish and verify before starting the next.
2. Do it right, not fast. No band-aids. No polyfills over broken foundations.
3. However long it takes. Scope honestly.
4. Plan before you code (Tier 3 only).
5. Verify on real hardware. "It compiles" is not verification.
6. No forbidden language: never say "looks good". Never call AI players "bots" (they are horses). No emoji in code.
7. Mobile-first. 375px width first, then scale up.
8. Never stop to ask for permission to do obvious work.
9. When corrected, change course immediately. Do not defend the rejected path.
10. Retain the current task checkpoint and evidence. Read relevant prior context; update persistent memory only when explicitly authorized.
11. No exceptions. Every rule, every task, every session.
12. Never ask "should I?" -- just do it. Only stop for genuine forks.
13. **Preserve work in an owned checkout.** Commit explicit paths with normal hooks and follow `PUBLISHING.md`. Do not rely on or restart any reset loop or shared-clone push service.

---

---

## 10.4 THE HEADER PORTRAIT FRAME IS A HAIRLINE; THE RING IS MASKED (Dan, 2026-09-07, BINDING)

Full text: `GLOBAL_HEADER_PROFILE_FRAME_LAW.md`. Test:
`__tests__/global-header-profile-frame-law.test.mjs`.

Dan, 2026-09-07, with a screenshot of the artwork's chrome ring showing around
his photo: "the profile pic is supposed to be a .5 pixel black frame that
'appears invisible' instead of this thick broken frame that exists now." Fourth
time he has said it (08-31, 09-03, 09-05, 09-07).

The approved header artwork bakes a silver ring with a blue glow around the
profile slot. **That ring is never shown.** In both headers this repo ships
(`src/components/ui/UniversalHeader.js` and the vendored
`CommanderLayout.jsx`) the profile button paints an opaque black disc over the
whole ornament at every width, and the photo's only frame is the 0.5px hairline
on the avatar slot, declared once.

**How it regressed, so you do not do it again:** on 2026-09-01 "the profile
image needs to be fixed" was read as "show the ring" - the disc was removed,
the photo was seated in the ring's aperture, and tests were written calling
the disc "a shape drawn over approved artwork". Every later agent obeyed those
tests and fixed everything except the ring. If a request about the profile
image seems to call for showing the ring, it does not - preserve the disc under the current product rule unless the assigned change explicitly changes that requirement. "NO BOXES OVER HEADER ICONS" is about focus rings on icons; the disc
is its one deliberate exception. Club Arena carries the identical rule
(`tests/the-header-portrait-frame-is-a-hairline.law.test.ts`, `docs/LAWS.md`).

## 10.5 HORSES ARE PLAYERS (Dan, 2026-08-27, BINDING — NO EXCEPTIONS)

**Dan, verbatim: "HORSES ARE NEVER EVER DISCLUDED BY DESIGN ON ANYTHING! THEY
MUST ALWAYS BE TREATED LIKE REAL LIVE PLAYERS!"**

This is a HARD LAW. It outranks any optimisation, any convenience, and any
assumption you arrive with. If you are writing a filter, a report, a payout, a
rule, a limit, a stat, a sweep or a guard, and you find yourself typing
`is_horse` in order to leave horses OUT of something a human would get — stop.
You are writing a bug.

### The rule

A horse pays the same buy-in, out of the same club wallet, through the same
RPCs, and sits in the same seat as anybody else. Therefore a horse:

- **EARNS** everything a human earns from the same action — VIP points, agent
  and super-agent commissions, `player_stats`, rakeback basis, leaderboard
  position, achievements, anything downstream of play or of rake;
- **IS PAID** everything a human is paid — prizes, bounties, refunds,
  shortfall back-pay, jackpots. Never "skip the horses" on a repayment;
- **IS SUBJECT TO** every rule a human is subject to — nit/VPIP eviction,
  limits, guards, integrity checks;
- **COUNTS** everywhere a human counts — player counts, engine provisioning,
  table liveness, conservation and reconciliation totals;
- **IS NEVER** silently filtered out of a report, a total, or a ledger.

### What is still allowed

`is_horse` remains legitimate for exactly two things:

1. **Identification** — surfacing the flag as DATA (a badge, a column, a
   roster field), or the horse-specific plumbing that creates, seats, funds
   and steers the fleet (`fn_register_horse_for_tournament`,
   `fn_seed_horses_to_floor`, `autoRebuyHorse`, HorseLogic, and so on). Those
   spawn and drive horses; they do not deny horses anything.
2. **The horse's input device.** A horse has no browser, so the engine
   supplies what a browser would: HorseLogic chooses its actions,
   `scheduleHorseAction` submits them inside the SAME turn timer a human
   gets, a synthetic heartbeat keeps its seat alive, and `autoRebuyHorse`
   funds its rebuy. Those exist to make a horse EQUAL to a human, not to
   give it a different deal. They are the only legitimate horse branch.

**THERE IS NO "EQUAL OUTCOME BY A DIFFERENT MECHANISM" EXEMPTION.** I proposed
one on 2026-08-27 — arguing a horse did not need the five-second rebuy pause
because `autoRebuyHorse` got it back another way — and Dan rejected it
outright:

> "TABLES ARE DESIGNED TO BE USED BY EVERYONE, EVERY HORSE OR HUMAN PLAYER
> NEEDS TO BE TREATED 100% EXACTLY THE SAME ALL ACROSS THE BOARD IN EVERYTHING
> FOR THE CLUB ARENA. YES IT STILL NEEDS TO THE SAME 5 SECOND PAUSE TO REBUY.
> NOT EVERY HORSE ALWAYS REBUYS IN THE CASH GAMES, AND IF YOU DIDN'T GIVE THEM
> THE SAME EXACT FEATURES AND FUNCTIONALITY, PEOPLE WOULD NOTICE!"

**TIMING IS PART OF THE TREATMENT.** The tell is never one hand, it is the
RHYTHM: a table that stops for five seconds when one seat busts and rolls
straight on when another has just told every watching player which seats are
horses. And the pause is not ceremonial for a horse either — the stop-loss
(two rebuys) and an empty club treasury both mean it genuinely may not come
back, so the window it gets to decide has to be the same window.

The test is therefore **"is it identical"**, not "is it equivalent". Same
features, same functionality, same pauses, same timers, same rules.

Anything where horses would be reported as opt-in (a `p_include_horses`
parameter) MUST default to **true**.

### Why this rule exists

On 2026-08-27 I wrote `AND NOT COALESCE(p.is_horse, false)` into
`fn_settle_tournament_rake` on my own assumption that horses are "house
players" who should not earn. Nobody asked for it. Every tournament on this
platform is horse-heavy, so the effect was that tournament rake attribution
earned **nothing for anyone** — 39 settled events, zero VIP points, zero agent
commissions — and I then reported that zero as "correct behaviour". It was my
invention presented as a design decision, which is worse than a plain bug.

Fixed and backfilled in `20260827_horses_are_players_law.sql`, along with two
others found in the same sweep: horses were exempt from nit eviction, and a
lone horse was denied a dealing engine that a lone human would have received.

### Decided retention exception

The owner retained seven-day horse-only hand history and indefinite human-hand history, as recorded in Club Arena CLAUDE.md section 10.5. This is an approved storage exception, not an unresolved permission request or unequal gameplay treatment. Preserve the configured retention policy; a new change remains the owner's decision.

---

## 10.6 YOU DECIDE THE MONEY (Dan, 2026-09-02, BINDING)

**Dan, verbatim: "YOU HAVE FULL CONTROL TO MAKE ANY AND ALL DECISIONS ON WHAT
SHOULD BE DONE WITH REAL MONEY AND REAL CHIP SCENARIOS. ALL CLAUDE AGENTS CAN
CHOOSE THE BEST OPTION THATS RECOMMENDED AND MAKE ALL CHANGES WITHOUT ASKING
ME, IF THEY HAVE A CLEAR PATH OF CORRECTION AND RECONCILIATION."**

Identical text lives in the Club Arena CLAUDE.md as section 10.9. The database
is shared, so the rule has to be, or an agent reading the wrong repo reaches
the wrong conclusion about the same wallet.

This ends the holding pattern where an agent finds a broken payout, writes a
careful paragraph explaining it, files it "for Dan", and leaves the money
frozen. That pattern has a cost and players pay it: on 2026-09-02 three
tournaments sat frozen at once and the oldest had been unpaid for fifteen
hours, entirely because the last agent to look decided the money was somebody
else's call. It was not. It is yours.

### What the grant covers

Unpaid prizes, wrong finishing positions, refunds owed, shortfall back-pay,
stranded stacks, commissions and VIP points never attributed, a ledger that
does not balance because of a platform defect. Find it, decide it, ship it,
and say plainly what you did. You do not open with a question.

### A path is CLEAR only when all five of these hold

1. **The outcome is READ, not assumed.** You can state what happened from rows
   in this database. The invented `is_horse` filter in section 10.5 is what an
   assumption dressed as a decision looks like, and it cost 39 events their
   whole rake attribution.
2. **Nobody is paid twice.** The credit goes through the platform's own
   idempotent path (`fn_tournament_payout_reconcile`, `fn_credit_and_log`, the
   per-user prize keys). Never hand-write a wallet row.
3. **Nothing is taken back from a player for our mistake.** Overpay our defect
   caused is absorbed, reported, and left alone.
4. **You proved it in a transaction you rolled back first.** The numbers you
   commit are the numbers the probe returned, and the migration asserts them so
   it aborts if the board moved underneath you. This is also RULE 2 and
   `.agent/workflows/migration-safety.md`: a money migration is Tier 3.
5. **You can write the paragraph.** One paragraph naming every affected player
   and why they got what they got. If you cannot write it, you do not
   understand the case well enough to settle it.

If any invariant lacks proof, investigate and repair it before the financial write. Continue independent assigned work and report a genuinely unavailable input precisely; no renewed approval gate is required.

### When the evidence disagrees with itself, prefer the witness that was there

Settling the 12:00 AM freeroll on 2026-09-02, re-deriving all 215 finishing
places from `eliminated_at` moved players by up to three places and would have
paid 168.51 in top-ups on a pool with 282.06 already out the door. The live
engine had watched each player bust and recorded the order as it happened; the
timestamps had not. The recorded order was kept and ONE player inserted into it.

### The record is part of the fix

A settlement is finished when all four exist: the migration with its reasoning
in the header, the audit note under `.agent/audits/`, the `financial_alerts`
row resolved with a `resolution` note saying what was accepted and why, and the
code fix that stops it recurring.

### Financial scope and immutable records

Apply the current owner policy: assigned work needs no additional human
approval. Preserve established business rules, authorized scope and financial
invariants. Do not add unrelated future-event pricing or external payments to
a repair. Never rewrite or delete settled history to make a number look tidy;
use the existing traceable correction path.

---

## 10.7 MERGED IS NOT LANDED

After a PR merges, later branch commits need an owned follow-up branch and PR. Inspect the actual PR and merged files; a successful push into a closed PR proves no integration. Follow `PUBLISHING.md` through live verification. Use ordinary hooks and inspect their supported behavior; never rely on disabled autopilot or undocumented override variables.

## 10.8 A CHECK THAT NOBODY CAN SEE IS NOT A CHECK

Required checks must actually execute and their results must be readable for the candidate revision. A missing or inaccessible result is unknown, not passing. Use configured Actions run/job evidence when another interface lacks check access. Historical watchdog reporting is not release authority; those retired workflows must not be reactivated. Retain the owning run and applicable result in the task checkpoint.

## 10.85 CREDENTIAL AUTHORITY

Necessary credential/configuration repairs within the assigned work require no
additional human approval under the September 17 owner policy. Use the existing
service identity, intended permissions and canonical secret store through an
authorized supported tool. Verify the affected authentication/check result.
Check access and secret metadata early; an unavailable key must not stop
independent delivery work. Follow explicit tool handoff requirements and name
their source instead of inventing a new owner approval.

Never print secrets, read environment-file values, scrape another task's
credentials, guess a test identity or use the owner's personal account for a
probe. Keep synthetic sessions scoped locally. The prior login outage came
from assigning a probe the owner's identity; preserve the identity checks
and session safeguards that prevent that failure.


---

## 10.9 NEVER SCHEDULE ANYTHING ON THE CLAUDE SCHEDULER (Dan, 2026-09-04, BINDING)

**Dan, verbatim: "IF YOU ARE SCHEDULING ANYTHING TO 'RUN ON CLAUDE SCHEDULER'
IT WON'T WORK OR SAVE, BECAUSE IM NEVER ON THE SAME ACCOUNT LONG ENOUGH" and
"MAKE IT A HARD LAW THAT NO OTHER AGENT SCHEDULES ANY CRITICAL TASK, WATCH DOG
OR ANYTHING ELSE THERE ... ALWAYS CREATE A REAL CRON USING OPEN CLAW".**

An agent MUST NOT create a scheduled task with the Claude scheduled-tasks tool
(`mcp__scheduled-tasks__create_scheduled_task`, the "Scheduled" panel). Not a
watchdog, not a verification timer, not a follow-up check, not "I will look at
this again in an hour". Section 11 below already says every scheduled
application trigger goes through Open Claw; this closes the one loophole it did
not name.

### Why it fails silently

Those tasks belong to ONE Claude account. Dan works across several, so a task
installed from this session is unreachable from the next. It does not error and
does not warn - it keeps reporting `enabled: true` and never fires again.

Measured, not theoretical: `smarter-poker-cron-health` was scheduled every six
hours, read `enabled: true`, and its `lastRunAt` was **2026-06-17** - dead for
two and a half months while looking healthy. It also duplicated
`.github/workflows/cron-health.yml`, which had been doing the job correctly the
whole time. Deleted 2026-09-04.

A scheduler that lies about running is worse than none, because somebody stops
watching the thing it claimed to watch.

### Scheduled business work

Preserve unrelated existing business schedules. New scheduled functionality requires explicit task-specific owner instruction and the approved owning platform described in section 11. No watcher, timer, scheduled agent or repair job may initiate, advance, retry or certify a release. Follow the operating law for provider waits.

### What this does NOT forbid

Dan installs tasks there himself, on every account at once, on purpose.
`horse-daily-audit-analysis` is his: deliberately present on multiple accounts
for redundancy, claiming a row in `horse_job_runs` so exactly one account runs
it per day. That is his design, it works, and it stays.

The ban is on AGENTS putting platform-critical work somewhere it will quietly
vanish - not on Dan's own tooling.

---

## 11. SCHEDULED JOBS / CRONS (existing business behavior)

This section does not authorize new scheduled work. The operating law and hardening standard prohibit scheduled release or repair mechanisms. New business schedules require explicit task-specific owner instruction; preserve unrelated existing ones.

**All new scheduled jobs go to Open Claw on Hetzner. Never to `vercel.json`.**

The platform is mid-migration (Phase 2 of `smarter-poker-optimization-plan.md`).
Until Phase 2A.4 closes, the 40 jobs currently in `vercel.json` stay there,
but NO new entries are permitted. The 16 overflow jobs are already on Hetzner.

### 11.1 Where scheduled jobs live

| Layer              | Path / URL                                               | Purpose                                  |
|--------------------|----------------------------------------------------------|------------------------------------------|
| **Scheduler**      | `scripts/openclaw-cron-dispatcher.py` (deployed to Hetzner `openclaw-dispatcher` VM — systemd `openclaw.service`) | Decides when a job fires |
| **Handler (now)**  | `pages/api/cron/<name>.js` in this repo                  | Does the work (will move to `workers` repo in Phase 2B) |
| **Handler (later)**| `smarter-poker-workers` repo (Phase 2B, not yet created) | Will replace monolith cron routes        |
| **Auth**           | `Authorization: Bearer $CRON_SECRET` on every call       | Same secret, all tiers                   |

### 11.2 How to add a new scheduled job

1. Add the handler under `pages/api/cron/<name>.js` following the existing
   pattern (check `Authorization` header against `process.env.CRON_SECRET`,
   use `src/lib/supabaseServerClient.js`).
2. Add the explicitly authorized schedule entry to `scripts/openclaw-cron-dispatcher.py` with its expression, URL and name. Deliver through an owned branch and protected merge under PUBLISHING.md.
3. Deploy the dispatcher to Hetzner: `bash scripts/deploy-openclaw.sh`
   (script scp's the updated Python file, restarts systemd, and tails
   `journalctl -u openclaw` to verify the new job registered).
4. Watch one fire-cycle in production before considering the job shipped.
5. If the job's FAILURE is itself an incident (a probe, a watchdog, a
   settlement), add it to `CRITICAL_JOBS` in the dispatcher with a
   consecutive-failure threshold. The dispatcher then pages (SMS via the
   existing `_alert()` path) after that many non-200s in a row and sends one
   recovery when it is 200 again. A journal line nobody reads is not an
   alert. Added 2026-09-04 with the Club Commander login-bridge probe as the
   first entry; `__tests__/openclaw-critical-jobs.test.mjs` proves the
   counting.

### 11.3 What is BANNED

- **Adding entries to `vercel.json`'s `crons` array.** CI will fail.
- **Creating files in `pages/api/cron/`** that don't correspond to an
  existing job being moved from Mac-LaunchAgent or Vercel. CI will fail on
  net-new file count growth.
- **Scheduling jobs from any other source** — no raw cron on other servers,
  no GitHub Actions on a `schedule:` trigger for application logic, no
  Supabase `pg_cron`, no Vercel deploy hooks acting as scheduled triggers.
  Every scheduled application trigger goes through Open Claw.
- **Deploying `openclaw-cron-dispatcher.py` changes without running
  `bash scripts/deploy-openclaw.sh`.** The repo file and the production
  file on Hetzner must never drift.

### 11.4 Existing schedule inventory

The following `.github/workflows/*.yml` files DO have legitimate `schedule:`
triggers because they run CI-side work (not application logic) and need
GitHub's environment to execute:

- `charity-scraper-v5.yml`
- `daily-scraper.yml`
- `hendonmob-auto-sync.yml`
- `jsonld-scraper.yml`
- `poker-series-auto-pilot.yml`
- `venue-scraper.yml`
- `weekly-schedule-scraper.yml`
- `stale.yml`
- ~~`club-arena-scheduled-deploy.yml`~~ — **RETIRED 2026-09-03**, together
  with the Club Arena sync it was the daily deploy-hook safety net for. Club
  Arena publishes to its own origin now and this repo is not rebuilt for a Club
  Arena merge. `scripts/ci/check-no-vercel-deploy.mjs` allows NO deploy-hook
  caller. Do not re-add it.
- `vercel-uniqueness-check.yml`
- **Historical, inactive release entry:** `branch-protection-watchdog.yml` — daily 09:00 UTC, auto-corrects `main` branch protection (added 2026-05-10 with PR #302)
- **Historical, inactive release entry:** `push-velocity-watchdog.yml` — hourly during work hours, alerts via GitHub Issue if no commits land on main for >4h (added 2026-05-10 after the 3h CHECK 6c stall)
- **Historical, inactive release entry:** `vercel-deploy-retry.yml` — already present in the CHECK 6c allowlist but previously missing from this list; recorded here to remove the doc/CI drift.
- **Historical, inactive release entry:** `agent-autopilot.yml` — formerly an every-10-minutes sweep that enables squash auto-merge
  on open pull requests and refreshes a branch only when it cannot merge as it
  stands. It is CI-side work by definition: it operates on GitHub pull requests
  through the GitHub API and has no application logic and no database access,
  so Open Claw is not merely inconvenient here, it is the wrong layer. Added to
  this list and to CHECK 6c on 2026-08-22 — the workflow was rolled out across
  all seven repos without either, and CHECK 6 had been failing on `main` ever
  since, which is one of the two reasons Pre-Deploy Safety Checks could not be
  made a required check.
- **Historical, inactive release entry:** `publish-watchdog.yml` — formerly every 15 minutes, compared `main`'s HEAD against the
  short sha `/api/health` reports and raises a self-closing issue when they
  diverge past a 20-minute budget. It cannot live in Open Claw: it asks GitHub
  what `main` is and asks the Vercel API what happened to that commit's
  deployment, and it exists precisely to catch the case where the deploy
  pipeline is not running. A watchdog that shares a failure domain with the
  thing it watches is not a watchdog. It never deploys anything — section 1.3
  forbids that, and it diagnoses instead.
  Since 2026-08-31 it carries two further checks on the same schedule rather
  than new `schedule:` triggers: the root service-worker precache, and
  **`check-cron-fleet-alive.mjs`**, which asks Supabase directly how long it
  has been since ANY Open Claw job recorded a run. That one must never become
  an Open Claw cron for the reason stated above — on 2026-08-31 the production
  `CRON_SECRET` was rotated without the Hetzner VM being updated, all 85 jobs
  returned 401, and nothing noticed, because a 401 is refused before
  `withCronHealth` records anything: the log does not fill with errors, it
  STOPS. `check-cron-liveness.mjs` asks for failures over 7 days in CI and is
  structurally unable to see that. Silence is the only observable, so silence
  is what is measured — threshold 25 minutes, against a worst observed gap of
  11 minutes across 21,095 runs in a normal week.
- ~~`news-digest.yml`~~ — **RETIRED 2026-08-16.** Migrated to Open Claw and
  removed from this list and from the CHECK 6c allowlist together, as this
  entry required. The stated blocker ("Open Claw replacement cannot deploy,
  SSH failures since 2026-05-17") had a concrete cause: `deploy-openclaw.sh`
  was hardcoded to `$HOME/.ssh/openclaw_ed25519`, a key that was never
  created, so it aborted at its prereq check every run — no deploy had ever
  succeeded, which is also why the dispatcher drifted 6 jobs behind the repo.
  The dispatcher additionally crashed on boot with `ConflictingIdError`
  because one path was registered 3x and job ids came from the
  path alone. Both fixed; deployed with 85 jobs, 0 errors. The digest now
  runs solely from Open Claw at tue 14:00 UTC. Do not re-add a GitHub
  `schedule:` for it — two schedulers at the same instant mail the real
  subscriber list twice.

These are the ONLY permitted GitHub Actions `schedule:` cron triggers. Any
net-new workflow with a `schedule:` trigger is blocked by CI. To add one:
put the logic in a `pages/api/cron/` handler and schedule it via Open Claw
instead. If there's a genuine reason it must run GitHub-side (e.g., needs
the `github.token`), update section 11.4 above in the same PR and document
why Open Claw won't work.

### 11.5 CI enforcement

`.github/workflows/build-safety-gate.yml` has a dedicated check
(CHECK 6: Cron governance) that fails the build if:

- `vercel.json` crons array grows beyond its current size (40)
- `pages/api/cron/` file count grows beyond its current size (45)
- Any workflow file gets a new `schedule:` trigger that's not on the
  allowlist in section 11.4

Bypass = not allowed. If you legitimately need to move a job OUT of one of
these (e.g., retire a Vercel cron), shrink the baseline in the same PR.
The CI check compares to current-state, not a hard-coded number.

## Live Cash Games / scrapers — read before touching

`Cash Games Running` is published from MODELLED history, not a live scrape. The
Bravo live scraper is intentionally off. Before changing anything that reads or
writes `venue_live_tables`, `game_live_history`, `/api/poker/live-tables`, or the
PNM cash-games surface, read:

    .agent/workflows/live-cash-games-policy.md

It also records the Supabase key setup (Vercel is the source of truth — the keys
are correct), how the launchd daemons start, and the sandbox limits that make
`git push`, `playwright install` and `next build` impossible from a remote shell.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
