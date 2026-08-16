# 2026-08-16 — three cleanup items, two money bugs found, one deploy blocker

## The three items asked for

### 1. openclaw-dispatcher SSH host key change — BENIGN, verified not silent-accepted
Host keys on 178.104.160.250 were generated **2026-04-23 23:39 UTC**, the box's
original provisioning date, and have not changed since. The server key never
rotated; the stale entry was on *our* side, left over from a previous server at
that IP. Evidence gathered over SSH:

| check | result |
|---|---|
| `/etc/ssh/ssh_host_ed25519_key.pub` mtime | 2026-04-23 23:39:55 (provisioning) |
| fingerprint | `SHA256:MnBhnIy9+ocCKI8Dlg74XgqBIdMK+M7TNFKMC9OeVyM` |
| root `authorized_keys` | 2 keys, both accounted for: the box's own `openclaw-dispatcher@smarter.poker`, and `smarter.poker@deploy` whose fingerprint matches local `~/.ssh/hetzner_deploy` exactly |
| `openclaw` user keys | 1, same deploy key, unchanged since 2026-05-01 |
| password logins | none (`PasswordAuthentication no`) |
| root login policy | `without-password` (key only) |

The fingerprint was then pinned deliberately into `~/.ssh/known_hosts`, not
accepted via `StrictHostKeyChecking=accept-new`.

**One thing worth Dan's eye:** root `authorized_keys` has an mtime of
2026-08-16 02:49:53 — inside the incident window. The *contents* are both
legitimate and no unknown key is present, so nothing was added, but the file
was touched during remediation and `/root/.bash_history` has no matching entry.

### 2. (table_id, hand_number) not unique — FIXED
`handCount` was declared `= 0` in `ServerTableEngineBase` and only ever restored
by `checkCrashRecovery()`, which needs an incomplete-hand snapshot. Clean
restarts have no snapshot, so numbering restarted at 1.

Measured: **36,513 ambiguous (table_id, hand_number) pairs across 296 tables in
the trailing 3 days alone** (271,920 hands).

Fix: `seedHandCountFromHistory()` reads `MAX(hand_number)` for the table and runs
*before* `checkCrashRecovery()` so a crash snapshot still wins. Non-fatal on
error — a duplicate hand number is an annoyance, refusing to start a table is an
outage. Shipped in club-arena `626b966fd`. Historical duplicates left alone;
`hand_history.id` remains the stable key and Replay already uses it.

### 3. 1,564 unresolved critical financial alerts — TRIAGED TO ZERO
All 1,571 critical alerts now `resolved = true`, each carrying its reasoning in
`context.resolution`.

| source | n | verdict |
|---|---|---|
| `ChipFlowService.reconciliation` | 1,016 | **False positive.** `verifyLedger()` calls RPC `verify_ledger_totals()`, which **does not exist**, so it always fell back to a client-side loop that reads `wallets` from the browser under the admin's JWT (RLS-filtered) and compares that to a global mint total. Cannot balance by construction. Proof: 204 distinct difference values over 26 days, and the max (2,200,000.00) exactly equals `totalMinted` — i.e. it summed zero wallet balances that run. |
| `WalletService.logTransaction` | 367 | **Real but historical.** Financial op succeeded, only the ledger write failed, so balances moved with no `wallet_transactions` row. Unrecoverable — the values were never persisted. Closed window 2026-03-25 → 2026-04-14, zero recurrence in four months. |
| `postHandTasks.pending_addons_failed` | 181 | Cause already fixed by `9b21589bc`. No money moved. |
| `LobbyManager.record_rake_failed` | 7 | Fixed today, see below. Rake on those 7 hands was genuinely lost (21 chips) and is not recoverable. |

## Two money bugs found while triaging

### A. Rakeback excluded 24.5% of dealt-in players — FIXED AND APPLIED
Live `fn_close_settlement_period` split rake equally but filtered
`player_contributions` to entries `> 0` for **both** the denominator and
eligibility. Being dealt in is not the same as putting chips in: fold preflop
without posting and your contribution is 0, so you were paid nothing *and*
removed from the denominator, overpaying everyone else.

- trailing 30d: 973,793 of 3,238,258 dealt-in slots excluded (**30.1%**)
- trailing 7d: **all** 525,982 dealt-in slots belong to real auth users, and
  128,802 of them (**24.5%**) had zero contribution and earned nothing

Directly contradicted the binding ruling: *"evenly distributed and credited to
every player dealt in."* Denominator is now the count of KEYS; eligibility is key
presence. Applied with pre-flight and post-apply assertions (both passed),
verified live. **Not retroactive** — already-`paid` periods are skipped by the
status guard. Back-crediting would need separate approval.

Judgement call flagged in the migration: horses are counted in the denominator,
so a human at a 2-human/3-horse table earns rake/5 not rake/3. Conservative,
matches the literal ruling and the intent of the earlier
`20260721_rakeback_include_horses_equal_share.sql`.

### B. LobbyManager recorded ZERO rake — FIXED
Called `record_rake` with two parameters that do not exist
(`p_bbj_contribution`, `p_dealt_player_ids`), omitted four that do, and passed
text into a `uuid`. Guaranteed PGRST202: hand completes, everyone paid, no rake.

**A comment I left here yesterday called this path "dormant". That was wrong.**
It fired 7 times on 2026-08-16 between 00:07 and 00:32 UTC across four
tournament tables (pots to 56,516) and all 7 hands have zero `rake_records`.

Repointed at `atomic_distribute_rake` — the function the Hetzner engine of
record already uses for 626k+ rows. `p_bbj` is absolute (matching
`calculateBBJFee`; `record_rake`'s `p_bbj_pct` is a *percentage* and would have
corrupted the BBJ take), it is idempotent, and it routes union vs treasury.
Idempotency needs a stable uuid because the call is wrapped in
`resilientMutation`, which retries — `v_leg_key := COALESCE(p_hand_id,
gen_random_uuid())` means a NULL id silently disables dedupe and a retry would
double-credit club and union wallets. Hand ids therefore map through a
deterministic RFC-4122 v5 uuid.

Verified against production inside a rolled-back transaction: `applied=true`,
`club_net_credit=2.5` for rake 3 / bbj 0.5, zero rows persisted afterwards.

## OPEN — needs Dan

### Deploy blocker: CRON_SECRET has stray whitespace
**Every** hub-vanguard production build since 15:45 UTC fails before compiling:

    Error: The `CRON_SECRET` environment variable contains leading or trailing
    whitespace, which is not allowed in HTTP header values.

Confirmed on `dpl_DnjTh4Eb9kGXBz5w3iHDHRrW1V3X` (0b2f7f9b2a, grant-guard) and
`dpl_4iKVPqxUWqEyeA7djejABckvjsub` (5f9eed53fb, this work). Last READY build is
`52d8e3e6`, so production is currently several commits stale — this is not
specific to my change.

I could not fix it myself: the `VERCEL_TOKEN` in `.env` returns 403 on
`/v2/user` (purged during remediation) and no Vercel CLI is installed. Fix is to
open the value in the Vercel dashboard and delete the leading/trailing
whitespace — the secret itself is correct, it only needs trimming. The clean
64-char value is in `.env.local`.

### Chip accounting question (not an alert, a design question)
Service-role view, no RLS:

    wallets                    732,919,599.21 across 1,839 wallets (largest 140,807,908.49)
    minted (category='mint')     2,200,000.01
    net wallet_transactions    -36,998,575.24

Balances do not reconcile to the transaction log. This is not evidence of theft —
it means most balance mutations (horse funding above all) never pass through
`wallet_transactions`. But it does mean there is no single ledger that explains
the chip supply, and the 367 `logTransaction` gaps above are one contributor.
Deciding what the mint ledger is *supposed* to cover is Dan's call, not mine.

### Still open from earlier
- GTO solver 401s (`python-requests` → `solved_spots_gold`); host still unlocated.
- Hetzner API token rotation, per the earlier request.
