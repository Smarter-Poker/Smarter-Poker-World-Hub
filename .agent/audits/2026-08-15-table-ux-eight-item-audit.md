# Antigravity work queue — from the 2026-08-15 table audit
Context: .agent/audits/2026-08-15-table-ux-eight-item-audit.md
Do not assume .memory/ is readable (gitignored). Ordered by risk, not effort.

## P0-1. Verify containment of the engine-host root compromise
CA commit 0eec5922c records a root compromise + XMRig miner, says containment
done. Never independently verified. A miner means arbitrary root execution, so
every secret that host could read is disclosed.
- Establish entry vector + window from 0eec5922c.
- Hunt persistence, not just the miner: systemd units, all users' crontabs,
  /etc/cron.*, every authorized_keys, ExecStart paths outside /usr|/opt.
- Rotate: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, host SSH keys, the deploy
  token used by auto-deploy-hetzner.yml.
- Service-role rotation must hit BOTH Vercel env and Hetzner env or settlement
  breaks.
Done when: written entry vector, persistence found/not, rotation timestamps.

## P0-2. A live GitHub PAT is printed to stdout by a git hook
WH .git/hooks/reference-transaction has a ghp_ token hardcoded and echoes it
whenever it blocks a reset. It printed into an agent session today.
- Revoke it now.
- The hook does not need a token at all — it only *suggests* a push command.
  Print `git push origin main`, drop the authenticated URL.
- Grep both repos' .git/hooks/ and .husky/ for other embedded secrets.

## P0-3. Decide: should chip-conservation violations block settlement?
StateVerifier.ts:353-435 computes sum(stacks)+rake+bbj == initial correctly,
then on violation calls reportError() and CONTINUES. A hand can pay out while
the books don't balance. ChipConservationVerifier is stricter but flag-gated
observe-only.
Product decision, not a bug: blocking risks freezing a table (Dan's hard rule:
never freeze); continuing risks paying an unbalanced hand.
- Query how often it has actually tripped in prod BEFORE proposing. Never
  tripped => blocking is cheap. Trips often => find out why first.

## P1-1. The server has no test of the real rake schedule
Every server rake test (HandController.audit/basicplay/reopening/bigblindante)
uses rakeConfig { percent: 5, cap: 100 }. cap:100 NEVER BINDS — the cap law is
untested engine-side. Those tests prove mechanics, not the schedule.
Client is covered now (RakeConfig.schedule.test.ts, 32 tests) + parity CI pins
client to server. Missing link: the engine honouring it.
- Drive PokerEngine.calculateRake / HandController.completeHand with real
  getFullRakeConfig(). Assert 10%; cap binds at 0.1/0.2 ($3), 1/2 ($5),
  10/25 ($15); HU + 3-handed cap reduction; no-flop-no-drop.
Done when: a pot large enough to hit the cap is proven capped.

## P1-2. Audit the second poker engine in World Hub
WH src/lib/poker-engine/ (LobbyManager.js via PokerLobby.jsx) has its own
record-rake.js -> record_rake RPC. Outside both the 2026-07-24 and today's rake
audits. If live, it is an unaudited money path and a second rake writer.
- Determine if any live route reaches it. Audit, or delete it — same reasoning
  as RakeService (deleted today): a dead-but-plausible money path gets revived.

## P1-3. Triage the unit suite — 45 of 162 files red
vitest run: 45 failed / 117 passed files, 38 failed tests. Button, Modal,
GlobalHeader, ErrorBoundary, cashier-flows, credit-request-flows,
tournament-flows, AchievementService, mapEngineSnapshot. Predates today's work
(zero failures reference anything I changed).
A suite this red gives no signal — that is how the main-was-red typecheck bug
survived.
- Bucket by cause, fix or quarantine with .skip + linked issue.
Done when: exits 0, or a CI-enforced allowlist that cannot grow.

## P1-4. Finish U5.3 — 53MB of probable duplicate-format assets
Removed 20MB today (25 unreferenced club-logo PNGs duplicating the WEBPs in
use). public/hub/club-arena/ went 104MB -> 85MB. Pattern likely continues:
  cards/           26MB   60 basenames in >1 format
  images/          26MB   61 basenames in >1 format
  game-card-icons/  8MB   50 png + manifest.json

READ THIS FIRST: my initial pass sampled literal filenames and reported cards/
as 0/25 referenced — implying 27MB dead. THAT WAS WRONG. Cards use constructed
paths (/cards/backs/${id}.webp, ICON_BASE = '/game-card-icons/'). Acting on it
would have broken every card back on the table.
- Write a real reference resolver: base-path constants, template literals,
  manifest.json. Delete only what it proves unreachable.
- Verify live after: referenced asset -> 200, deleted asset -> 404.
- NO Cloudflare/R2 credentials exist (13 env files, wrangler config, keychain
  all clean; R2 only appears in docs/PHASE-1.8-R2-MIGRATION.md). DO NOT
  provision R2. Use Supabase Storage — 22 public buckets already exist
  (club-logos, assets, images, media) and SERVICE_ROLE_KEY is available. Keeps
  RULE 12 satisfied.

## P2-1. Arena pre-commit guard blocks merge resolutions
It rejects any commit touching public/hub/club-arena/ without ARENA_BUILD=1.
Correct for hand-edited build output — but it also blocks merge-conflict
resolutions, which sync-club-arena.sh cannot perform. Forced a manual
ARENA_BUILD=1 commit today to land a 308-file merge.
- Exempt the merge case: if .git/MERGE_HEAD exists, allow.

## P2-2. Time-bank config mismatch + missing types
Server defaults maxUses = 120 (VIP monthly); client seeds 4. And
time_bank_remaining / time_bank_uses_remaining are absent from
database.types.ts, hence the `as any` at TablePage.tsx:3274.
- Reconcile the number with Dan, regenerate types from live schema, drop casts.

## P2-3. Close remaining plan phases
- U3.4 — server/src/index.ts is 133 lines vs <=100 target.
- U6 — archive superseded docs (POKERBROS_UPGRADE_PLAN, PHASE_3/4_*_PLAN,
  MASTER_BLUEPRINT) with a README naming what supersedes each. Several still
  read as authoritative.
- news-digest.yml — time-boxed CI cron exception. Only calls /api/news/digest
  over HTTP with CRON_SECRET, so it belongs on Open Claw. Steps in
  .agent/handoffs/2026-08-13-migrate-news-digest-to-openclaw.md. Remove from
  CLAUDE.md 11.4 AND the CHECK 6c allowlist in the same PR.

## Working notes
- DO NOT run git write commands from a Cowork sandbox VM. The mount cannot
  unlink: `git stash pop` reports success and writes nothing; `git commit`
  strands a .git/index.lock that then blocks git on the Mac host. Use the host
  terminal. Clear a stranded lock with mv, not rm.
- A stranded .git/rebase-merge silently reverted an edit and made
  `git commit --amend` a no-op today. Check for it when git behaves oddly.
- Both repos are high-churn; multiple agents commit concurrently. Check
  `git log --oneline -5` and mtimes before editing TablePage.tsx (7,100 lines)
  or anything in public/hub/club-arena/.
- The CA->WH sync loop runs itself within ~a minute of a CA push. Running
  sync-club-arena.sh manually in parallel produced 34 merge conflicts in
  generated bundles today. Push source, then verify prod.
- Verify engine deploys behaviourally — engine.smarter.poker/health is
  cache-frozen. Look for the restart signature in Supabase: a cluster of
  tables.updated_at in one minute (22 tables in a minute today).
