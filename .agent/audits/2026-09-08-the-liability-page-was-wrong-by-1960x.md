# The diamond liability page was wrong by a factor of 1,960

2026-09-08. `pages/api/admin/diamond-liability.js`, `src/config/diamondRewards.js`.

## What was wrong

`/api/admin/diamond-liability` is the one page that shows how much diamond
liability the platform has taken on this month. Asked on 2026-09-08 it reported

```
spentDiamonds  1210        percentUsed  0.05%
```

The true month-to-date issuance was **2,371,393** — 94.9% of the 2,500,000 plan.

The page read `diamond_platform_budget.spent_diamonds`. That column had been a
running total until that morning, when `ca_diamond_engine_spend` replaced it:
the single row's lock was held until the awarding transaction committed, which
serialised the whole platform and lost **5,861 awards worth 399,948 diamonds**
in one morning to lock timeouts. The column became a frozen baseline. Nothing
told this page, so it kept dividing a dead number by a live budget.

Wrong is bad; **wrong in the reassuring direction on the page you open to check
for trouble** is the specific failure club-arena CLAUDE.md 10.86 exists about.

## The second, quieter error in the same panel

The panel called itself "the platform-wide circuit breaker". Ruling 21
(2026-09-08 — Dan: *"THERE SHOULDN'T BE A PLATFORM BUDGET ON THINGS LIKE THIS,
ONLY A USER BUDGET"*) had removed the platform budget from every refusal path.
Nothing on that panel stops any player.

A panel naming itself a control it is not teaches whoever reads it that
something is being guarded. `src/config/diamondRewards.js` carried the same
claim in a comment — that `award_diamonds_v2` "returns reason
`budget_exhausted` for everyone until the month rolls" — which has not been true
since ruling 21.

## What changed

- The route reads `fn_ca_diamond_budget_reality(period)`, which sums the live
  append-only journal per engine, and no longer references the frozen column.
- An unreadable answer — missing function, failed call — is reported as
  **UNKNOWN, not zero**. A liability page that renders 0 when it could not ask
  is the same defect one level up.
- Engines with no plan are counted as *unplanned*, not as a zero budget.
- The response carries `refusesPlayers: false`, and a note naming
  `diamond_engine_daily_caps` and `fn_ca_diamond_cap_headroom` as what does
  refuse a player.
- Budget lines that are fiction are listed rather than averaged into the total.
  Today that is three: `2026-09/daily_missions` at 4.3x its plan, and two
  October plans below past actuals.
- The config comment records ruling 21, why a platform-wide breaker was the
  wrong shape (it refuses the player who happens to earn last, for what a
  thousand others did — it punishes arrival order), and warns that the
  `budget_exhausted` strings still mapped in `pages/api/rewards/*.js` are an
  unreachable defensive default and **not** evidence the breaker exists
  (club-arena CLAUDE.md 10.8: deployed code is not a law).

Pinned by `__tests__/the-liability-page-reads-the-live-number.law.test.mjs`.

## Not changed, deliberately

The budget numbers themselves. `2026-10/daily_challenges` is planned at 100,000
against a September actual of 1,836,311, and `2026-09/daily_missions` is at
4.3x. Those are wrong, but what an engine is budgeted to issue is what players
will be offered, and CLAUDE.md 10.9 reserves that to Dan. Making the gap
impossible to miss is the part that was mine.
