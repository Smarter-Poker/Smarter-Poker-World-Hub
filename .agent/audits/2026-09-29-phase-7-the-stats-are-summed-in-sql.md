# Phase 7 of 8 (World Hub): the wallet Stats panel is summed in SQL, not over one page

**Date:** 2026-09-29
**Files:** `pages/api/store/diamond-transactions.js`,
`src/components/store/DiamondWalletModal.jsx`,
`__tests__/the-stats-panel-is-summed-in-sql.test.mjs` (new),
`__tests__/_test-guards-exist.test.mjs` (registration),
`.agent/audits/2026-08-31-training-phase-2-inventory.json` (regenerated, line numbers only)

## The defect

One panel reported one ledger two different ways.

Since 2026-09-13 the headline **Total Earned / Total Spent** has come from
`fn_diamond_lifetime_totals` - summed in Postgres over the whole ledger. The
bars, the donut and the gift plates **directly beneath that headline** were
`Object.entries` over `lifetime.bySource` and `lifetime.giftsSent`, which the
API had reduced over its 5,000 most recent rows. The route's own comment said
so.

So the top of the box was exact and the bottom of the box was windowed, and the
two would part company the moment a player's ledger outgrew the page. A player
whose 5,000 most recent rows held no gifts would have been told they had never
sent one, under a lifetime total that counted them.

`fn_diamond_flow_by_kind(p_user_id uuid)` already existed, already summed the
whole ledger per bucket, and Club Arena already read it
(`DiamondService.getDiamondFlow`). **The World Hub referenced it nowhere.**
That was the entire gap.

## The measurement that justifies the change, and its honest limit

Read-only, against production, 2026-09-29.

| Rank | Ledger rows | Lifetime earned | Lifetime spent |
| ---- | ----------- | --------------- | -------------- |
| 1    | **609**     | 613,595         | 132,320        |
| 2    | 183         | 6,613           | 640            |
| 3    | 180         | 6,564           | 640            |
| 4    | 177         | 6,553           | 640            |
| 5    | 171         | 11,333          | 5,200          |

**The heaviest wallet on the platform holds 609 rows against a 5,000-row
window. Nobody is truncated today, so no player is currently seeing a wrong
number.** This was a latent defect, not a live one, and this record says so
rather than inflating it. What makes it worth fixing now is the shape of the
failure, not its present size: it is invisible until a ledger crosses 5,000, at
which point the panel begins disagreeing with itself silently and permanently,
and the first person to notice is a player. The heaviest wallet is already at
12% of the ceiling.

The RPC's answer for that heaviest wallet, read live, matches a raw `SUM()`
over `diamond_transactions` exactly (613,595 earned / 132,320 spent), across 15
buckets - 7 spent, 8 earned.

## Step 0: what the function actually is

```
fn_diamond_flow_by_kind(p_user_id uuid DEFAULT NULL) RETURNS jsonb
  STABLE SECURITY DEFINER, search_path = public, pg_temp
  acl: postgres=X, authenticated=X, service_role=X
```

Two facts decided the implementation, and neither was safe to assume:

1. **`p_user_id` defaults to `auth.uid()`.** Club Arena calls it with no
   argument from the browser, where that resolves to the signed-in player.
   **The World Hub route is server-side with a service-role client, so
   `auth.uid()` is NULL** and the no-argument form raises
   `authentication_required`. The route therefore passes the id explicitly.
2. **Its guard is `v_role <> 'service_role' AND v_user IS DISTINCT FROM
auth.uid()`.** Passing another user's id is refused for everyone except a
   `service_role` caller. Verified both ways live: calling it with an explicit
   id under the MCP's own role raised `diamond_flow_is_own_only`; the same call
   with `request.jwt.claims` set to `{"role":"service_role"}` and `auth.uid()`
   NULL returned the full breakdown. That is exactly the route's situation.

The id passed is `localUser.id` from `getServerUserWithFallback` - the verified
JWT subject. `req.query.userId` appears nowhere in the route (code safety rule
5, IDOR), and the guard asserts that.

Return shape, measured rather than assumed:

```
{ spent:  [{ bucket, label, lifetime, lifetime_count, last30, last30_count }],
  earned: [ ...same... ],
  spent_total, earned_total, spent_last30, earned_last30,
  user_id, read_at }
```

## What changed

**Server.** One added read, `fn_diamond_flow_by_kind`, first page only, user id
explicit. Parsed with the same strictness as the Club Arena consumer: every
figure must be finite and every bucket must be named, or the whole read is
refused and `flow` stays `null`. The error is checked before the body is
touched, so an unreadable answer is never coerced into an empty one.

**The dead reduce is deleted, not left beside its replacement.** `bySource`,
`giftsSent`, `giftsReceived` and `giftCount` are gone from the server loop and
from the response. Two code paths for one number is how a panel ends up
disagreeing with itself, which is the defect this phase exists to close.

**Client.** `stats` reads `flow`. Sources merge the earned and spent buckets by
label (the old `bySource` was sign-agnostic, so merging preserves the panel's
meaning while changing where the number comes from). The donut is derived from
the same list as the bars, so the two pictures of one ledger cannot diverge.

## What the panel does when the read fails

It says so. `flow === null` renders **"Breakdown Unavailable Right Now. Pull
Down To Refresh."** in place of the bars; the donut is not drawn; the gift
plates do not appear. It never renders zero, and it never quietly re-derives
the breakdown from the loaded page and presents that as the whole ledger
(10.86).

`null` (unreadable) and `[]` (a ledger with nothing in it) are kept as
different values and render differently. The headline above is unaffected: it
has its own RPC and its own `exact` flag.

## What is still browser-side, stated plainly

Three things cannot read `flow`, and each is now honest about itself rather
than quietly wrong:

1. **"This Week".** The RPC reports lifetime and a rolling 30 days; it has no
   7-day figure. The week therefore stays a window sum - but the window is now
   **proved** to cover the week rather than assumed to. `weekExact` is true
   when the window was not full (it is then the whole ledger) or when the
   oldest row in a full window predates the week boundary, which is sufficient
   because the window is ordered newest first. When it cannot be proved, the
   plate reads "This Week: +N Or More".
2. **Monthly Comparison.** Calendar months are not a rolling 30 days.
3. **Top Recipients.** Recipient names are parsed out of the description text;
   no per-recipient SQL exists. This is the only thing still reduced over the
   window on the server.

(2) and (3) print "From Your 5,000 Most Recent Entries, Not Your Whole
History." when `truncated` is true. Closing them properly needs new SQL, which
is a migration and out of scope for this phase.

## Laws

- **10.5, horses are players.** The RPC takes no include/exclude flag and
  nothing on this path filters on `is_horse`. Asserted.
- **10.86, could-not-tell is its own outcome.** Above; asserted.
- **Rule 4** (shared server client, no raw SDK import), **rule 1**
  (`.maybeSingle()`), **rule 5** (JWT identity), **rule 7** (no emoji), no em
  dashes in player copy, `.toLocaleString()` on every figure. Asserted.

## Verification

`node --test __tests__/the-stats-panel-is-summed-in-sql.test.mjs` - 10 pass.
The guard was checked against `origin/main` to confirm it discriminates:
`fn_diamond_flow_by_kind` appears 0 times in main's route and
`lifetime.bySource` appears in main's modal, so both the "reads the RPC" and
the "reduce is deleted" cases fail on main and pass here.

The training surface inventory was regenerated (`--write`) because the edit
moved line numbers. Its counters are unchanged: an earlier draft's comment
contained the word "fallback" twice, which the scanner recorded as two new
runtime-fallback markers and a phantom phase-15 follow-up; the comment was
reworded so the audit file takes only line-number churn.

No migration, no DDL, no write of any kind was made to the database by this
phase. Every query run against production was read-only.
