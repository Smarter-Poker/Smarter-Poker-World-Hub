# HANDOFF 2026-08-23 — ship the union wallet / diamond mint fixes

**Why this is a handoff and not a push:** RULE 0 exception "credentials the agent
has no path to obtain."

- The Cowork sandbox has **no network route to GitHub** (`git ls-remote` ->
  `Host key verification failed`) and **cannot write git objects** on the mount
  (`unable to unlink '.git/objects/../tmp_obj_*': Operation not permitted`), so
  `git commit` runs the hooks, passes them, then silently fails to create the
  commit. HEAD is still `11aa25fab9`.
- The **GitHub MCP server returns `Authentication Failed: Bad credentials`** — the
  documented fallback in `.agent/workflows/claude-mcp-push.md` is dead. Same
  symptom as `.agent/handoffs/2026-08-16-restore-cowork-github-bridge.md`; the
  token behind the Cowork GitHub MCP needs re-issuing.

Everything below is written to disk and **staged in the index**. Staged work is
what the Antigravity `git reset --hard origin/main` loop destroys — please land
this promptly.

## What is ALREADY LIVE (no action needed)

All three migrations are **applied to production Supabase** (`kuklfnapbkmacvwxktbh`)
and their post-apply assertions passed. The diamond mint is stopped, the clawback
is done, the split is fixed. Verify any time with:

```sql
SELECT fn_bbj_conservation_check();   -- expect healthy:true, drift 0.00
SELECT fn_bbj_gap_decomposition();    -- expect merged_pool_residual_erased 56938.27
SELECT status, count(*) FROM trivia_pvp_matches GROUP BY 1;  -- expect abandoned:4, no 'active'
```

## What needs shipping

Five files, all staged:

| file | state |
|---|---|
| `pages/api/club-arena/union-wallet.js` | modified — needs a Vercel deploy to take effect |
| `supabase/migrations/20260823_pvp_refund_mint_leak.sql` | new — already applied, needs to be in the repo for the record |
| `supabase/migrations/20260823_bbj_split_residual_carry.sql` | new — already applied |
| `supabase/migrations/20260823_bbj_conservation_honest_baseline.sql` | new — already applied |
| `.agent/audits/2026-08-23-union-wallet-and-diamond-mint-audit.md` | new |

## Execute

```bash
cd ~/Documents/Smarter-Poker-World-Hub
git status --porcelain   # confirm the five files above and nothing unexpected
bash scripts/git-safe-push.sh "fix(economy): stop the PvP refund diamond mint, fix BBJ 50/25/25 rounding drift, surface spin treasury"
```

Do not stop until it exits 0 with `DEPLOY_VERIFIED:true` and `SHA_MATCHED:true`.

Commit author must resolve to
`Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` (CHECK 15 —
Vercel BLOCKs commits it cannot attribute).

## Second job — `smarter-poker-workers`

`/api/cron/trivia-pvp-cleanup` in that repo is the source of the mint. It is now
blocked at the database, so it can no longer pay, but it will log a refusal every
4 hours until fixed. In `refundPlayer()`:

```js
// BEFORE
async function refundPlayer(playerId, amount) {
    await getSupabase().rpc('add_diamonds_to_balance', {
        p_user_id: playerId, p_amount: amount, p_type: 'pvp_refund',
        p_description: `PvP match abandoned - ${amount}diamonds refund`,
        p_reference_id: null                       // <-- mints on every replay
    });
}

// AFTER — matchId must be threaded in from the caller
async function refundPlayer(playerId, amount, matchId) {
    const { data, error } = await getSupabase().rpc('add_diamonds_to_balance', {
        p_user_id: playerId, p_amount: amount, p_type: 'pvp_refund',
        p_description: `PvP match abandoned - ${amount} diamonds refunded`,
        p_reference_id: `pvp_refund_${matchId}_${playerId}`
    });
    if (error || data?.success === false) {
        throw new Error(`refund failed: ${error?.message || data?.error}`);
    }
}
```

`pvp_refund_<matchId>_<userId>` is the exact reference
`pages/api/trivia/pvp-settle-match.js` has always used, so the two paths dedup
against each other for free.

Also check the return of the status write in the same handler — the unchecked
`.update({ status: 'abandoned' })` is the whole reason this ran for ten days:

```js
const { error: statusErr } = await supabase
    .from('trivia_pvp_matches').update({ status: 'abandoned' }).eq('id', match.id);
if (statusErr) throw new Error(`could not close match ${match.id}: ${statusErr.message}`);
```

The CHECK constraint now accepts `abandoned`, so this will succeed — but it must
still be checked, or the next unmodelled status value repeats the incident.

## Open decision for Dan (do not action without him)

Restoring **56,938.27** to the live BBJ pool. It was contributed by players out of
real pots, banked, then erased when pool `0867a7fd` was manually merged into
`f9806a7f` without the destination being credited. Restoring it raises jackpot
liability by the same amount. Paste-ready SQL is in the footer of
`supabase/migrations/20260823_bbj_conservation_honest_baseline.sql`.

Full write-up: `.agent/audits/2026-08-23-union-wallet-and-diamond-mint-audit.md`
