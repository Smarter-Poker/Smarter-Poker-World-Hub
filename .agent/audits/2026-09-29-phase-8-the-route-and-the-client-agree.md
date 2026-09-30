# Phase 8 of 8 (World Hub): the route and the client agree, plus the live wallet smoke

Date: 2026-09-29
Branch: `agent/cw-hubcontract8-0929/test/phase-8-the-route-and-the-client-agree`
Base: `origin/main` at `c33cc3a9f954c6ca24bc0ee2ae6ba7f06579e55f`

## What was wrong

Phases 1 to 7 built a chain across one boundary:

```
Postgres  ->  pages/api/store/diamond-transactions.js  ->  src/components/store/DiamondWalletModal.jsx
```

Both ends were pinned, separately. `the-wallet-badges-count-the-whole-ledger.law`
and `the-stats-panel-is-summed-in-sql` hold the route; the component guards hold
the interface. Nothing held the JOIN.

A separately pinned boundary is one that drifts with both halves green:

- a field renamed on one side only;
- a bucket key the SQL emits and no branch renders;
- a column dropped from the route's `select(...)` that the interface still
  reads. `player_line` is the sharp case: it is a PostgREST **computed**
  column, so it is absent from `*`, absent from `information_schema`, and
  invisible to any stored-column snapshot. Stop naming it and every row still
  renders. The ledger line just goes blank.

Every symptom is the same shape: a figure a player notices before we do.

## What was built

### 1. `scripts/ci/lib/diamond-wallet-contract.mjs` (new)

One production-derived snapshot, read by two readers. Two lists is how the two
halves of a boundary drift while both stay green, so there is one, and it lives
in a file neither side of the boundary owns.

Every constant was read off production (`kuklfnapbkmacvwxktbh`) with read-only
SQL on 2026-09-29. No assumption, no copy from a migration that may not have
applied:

| constant | derived from |
| --- | --- |
| `STORED_COLUMNS` (13) | `information_schema.columns` |
| `COMPUTED_COLUMNS` (`player_line`) | `pg_proc`: a function whose single argument is the table's own composite type |
| `LIFETIME_TOTALS_KEYS` (4) | `pg_get_function_result('fn_diamond_lifetime_totals')` |
| `WALLET_SUMMARY_KEYS` (11) + `arena` (8) | the function's own `RETURN jsonb_build_object` |
| `FLOW_KEYS` (8), `FLOW_LINE_KEYS` (6) | the function's own `jsonb_build_object` |
| `BUCKET_LABELS` / `BUCKET_KEYS` (21) | every `THEN '<key>'` plus the final `ELSE` in `fn_diamond_kind_bucket`, cross-checked against the 15 buckets a live ledger currently produces |

**Why the two jsonb functions were read from their bodies rather than called.**
`fn_diamond_wallet_summary` and `fn_diamond_flow_by_kind` refuse a caller that
is neither the subject nor `service_role` (`wallet_summary_is_own_only`,
ERRCODE 42501), and a read-only analyst session is neither. Their own
`RETURN jsonb_build_object` is the same truth and needed no elevation. The live
smoke calls them for real when it is given a key, and says COULD NOT TELL when
it is not.

### 2. `__tests__/the-route-and-the-client-agree.test.mjs` (new, 12 cases)

Offline, every pull request. Registered in `__tests__/_test-guards-exist.test.mjs`,
which is what CHECK 8 runs, and whose own reachability meta-guard would have
caught it had it not been.

- **columns** - the row select must carry `*` AND name every computed column;
  every `tx.<col>` the wallet reads must be a column production serves; every
  column the route names explicitly must be one the wallet reads (dead weight);
  the 5,000-row lifetime window select and the route's own reducer must ask for
  exactly the same five columns.
- **rpc keys** - every `row.<key>` the route reads off each of the three RPCs
  must be a key that RPC returns, per block, anchored so a renamed anchor fails
  loudly instead of quietly narrowing the scan to nothing.
- **response shape** - every `data.<key>` the wallet reads must be a key the
  route's 200 literal sends; every `walletSummary.*`, `lifetime.*`, `flow.*`
  and bucket-line field must be one the route builds.
- **buckets** - every bucket key the wallet names (`gifts_sent`,
  `gifts_received`) must be one `fn_diamond_kind_bucket` can emit; the
  breakdown must accumulate over BOTH whole arrays keyed by the SQL's own
  label, with no filter on either side. `fn_diamond_kind_bucket` can emit 21
  buckets and a live ledger currently produces 15, so six can arrive with no
  warning; an allowlist would drop them and the player would watch those
  diamonds vanish out of the breakdown.

Every extractor asserts its own anchor is present before it asserts anything
about what it found (10.86 rule 1): a regex matching nothing must not report an
empty set and pass.

### 3. `scripts/ci/diamond-wallet-live-smoke.mjs` (new)

`node scripts/ci/diamond-wallet-live-smoke.mjs [--json]`

Read-only, on demand, three outcomes:

- exit `0` PASS, exit `1` FAIL, exit `3` UNKNOWN / could-not-tell.
- `res.ok` is checked before any body is read. An unreadable answer is never
  coerced into an empty or passing one.
- It deliberately does NOT use `scripts/ci/lib/resilient-fetch.mjs`, which
  every other gate here uses: that helper calls `process.exit(1)` when the
  network is down, which for this check would turn "I could not reach the site"
  into FAIL. That is the collapse 10.86 rule 1 forbids, and inheriting it would
  be rule 4 (a fix that leaves the same trap one level up).

It asks three questions: the two `build-info.json` documents agree on `ca_sha`;
`smarter.poker/api/health` is ok; and every diamond object exists and answers
the shape the wallet reads, matched field by field against the same snapshot
the offline test uses. Offline the code matches the snapshot; here the snapshot
matches the database. A drift on either side has a reader (10.83).

Section 3 reads `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_KEY`) from the
**environment**. It never reads a `.env` file, never prints a key, never guesses
an identity, and never prints the player id it discovered. With no key present,
section 3 is UNKNOWN with that as its stated reason - not skipped, not green.

**It is not scheduled and must never become scheduled.** World Hub CLAUDE.md
10.9 and Club Arena 10.85 forbid an agent creating a Claude scheduled task;
section 11.3 forbids a new `vercel.json` cron, a new `pages/api/cron/` handler
and a new GitHub `schedule:` trigger, and CHECK 6 fails on the net-new counts.
This is a command a person runs. **It is not a repair** (10.11, 10.12): it
writes nothing, retries nothing and reconciles nothing. Every request is a GET
or a POST to a read-only PostgREST rpc.

## Discrimination proof

A guard that passes against a broken tree is not a guard. Each contract was
broken on purpose, one at a time, in the working tree; the suite was run; the
tree was restored with `git checkout --`. Baseline before and after: 12 pass,
0 fail.

| # | mutation | result |
| --- | --- | --- |
| 1 | route: `select('*, player_line')` -> `select('*')` | 10 pass, **2 fail** |
| 2 | client: added a read of `tx.not_a_column` | 11 pass, **1 fail** |
| 3 | route: `row.sendable` -> `row.sendible` (wallet summary) | 11 pass, **1 fail** |
| 4 | route: `r.lifetime_count` -> `r.lifetime_kount` (flow line) | 11 pass, **1 fail** |
| 5 | client: `giftLine(flow.spent, 'gifts_sent')` -> `'gifts_dispatched'` | 11 pass, **1 fail** |
| 6 | client: breakdown iterates `flow.earned` only, dropping every spent bucket | 11 pass, **1 fail** |
| 7 | route: response field `truncated` -> `truncatedWindow` | 11 pass, **1 fail** |
| 8 | route: window select gains `source`, which the reducer never reads | 11 pass, **1 fail** |

The smoke check's own outcomes were exercised the same way: a real run
(PASS / PASS / UNKNOWN, exit 3), a run with a nonsense key (section 3 UNKNOWN
for a different and correctly reported reason, `HTTP 401 Invalid API key`), and
a forced `ca_sha` mismatch (**FAIL**, exit 1).

## Scope

No migrations, no DDL, no database writes. No product behaviour changed: three
new files and one import line in the guard registry. All production SQL was
read-only.
