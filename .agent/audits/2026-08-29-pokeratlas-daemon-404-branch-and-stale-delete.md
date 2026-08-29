# PokerAtlas daemon — three defects shipped in PR #930

**2026-08-29** — `Smarter-Poker-World-Hub`, `scripts/pokeratlas-live-daemon.py`.

PR #930 rewrote the daemon to sweep 710 individual venue pages instead of region
pages, with a 7-day "no cash games" cache to stay inside the 15-minute interval.
The idea is right and the surrounding work is careful. Three things in it are
broken, and they compound.

The first thing I checked was the one that matters most for the published
product, and **it is fine**: `tables_running` is still written as `None` for
`source='pokeratlas'` in both payload blocks, so the catalogue cannot leak into
the cash-games count that `.agent/workflows/live-cash-games-policy.md` governs.
Nothing here changes `data_mode`, `data_is_live`, or the simulator.

---

## 1. The 404 branch is dead code

```python
if html == 'REDIRECT' or html == '404':      # <- never true for '404'
```

The literal `'404'` appears **exactly once in 1,783 lines** — that comparison.
No fetch tier has ever returned it. `fetch_page` returns HTML, `None`, or
`'REDIRECT'`; on `resp.status != 200` it logs and returns `None`.

So a venue whose `/cash-games` page genuinely 404s — **the exact case the cache
was built for** — falls through to the `html is None` branch and is counted as a
failure:

```python
if html is None:
    log.error(f'  All tiers failed for {slug}')
    consecutive_region_failures += 1
```

`CIRCUIT_BREAKER_THRESHOLD = 5`. Five venues in a row without a cash-games page
— unremarkable in a 710-venue list — abort the cycle and mark the session dead.
Each one also pays for a Tier-2 Playwright launch and a Tier-3 urllib attempt
before being recorded as a failure, which is most of why a cold sweep cannot
finish inside its interval.

The net effect is that the feature the PR was written to add does not work: real
404s are never cached, only redirects and empty parses are.

**Fixed** by giving the tiers a sentinel they actually return (`NO_CASH_PAGE`,
on 404/410 in all three), so a missing page is a definitive answer — cacheable,
not a failure, and it short-circuits the fallback chain instead of paying for it.

## 2. A successful-but-empty parse was cached for 7 days

```python
if not venues:
    parsed_empty += 1
    nocash_cache[slug] = now_ts       # persisted immediately
```

A page that fetched fine but parsed to zero games was written into the 7-day
cache with no sanity check. If PokerAtlas changes its markup, every venue parses
to zero, **all 710 slugs are cached as "no cash games" in a single cycle**, and
the daemon then skips the entire estate for a week while reporting success.

That is the same shape as the incident the policy doc already records: a silent
zero presented as normal.

**Fixed** by buffering empty slugs and committing them only if the empty rate
among venues we actually retrieved is below 80%. Above that it is a parser
break, not the country closing at once — it now logs `ERROR_PARSE` loudly and
caches nothing, so the next cycle retries.

## 3. `fetch_ok` counted redirects — and it guards a DELETE

This is the one with teeth.

```python
if html == 'REDIRECT' or html == '404':
    ...
    fetch_ok += 1        # <- counts a page we never retrieved
```

`fetch_ok` is the sole guard on the destructive stale-row cleanup:

```python
elif fetch_ok == 0:
    log.warning('Stale cleanup skipped: zero successful fetches '
                '(cannot distinguish outage from empty)')
else:
    sb_delete('venue_live_tables', f'scrape_batch_id=neq.{batch_id}&source=eq.pokeratlas')
```

So: PokerAtlas starts redirecting site-wide → all 710 venues return `REDIRECT` →
`fetch_ok = 710`, `all_venues = []` → EMPTY PAYLOAD → the guard is satisfied by
responses that never contained a venue page → **every PokerAtlas row in
`venue_live_tables` is deleted.** Defect 2 then caches all 710 slugs, so
subsequent cycles skip everything and the catalogue cannot self-heal for a week.

The guard's own comment says its purpose is that it "cannot distinguish outage
from empty". Counting a redirect as a successful fetch is precisely what
destroys that distinction.

**Fixed** by making `fetch_ok` mean what its guard needs it to mean — a venue
page retrieved *and parsed*. Redirects and missing pages are counted separately
as `no_page`, surfaced in the heartbeat and the evidence record.

## 4. The sweep cannot finish, and an unfinished sweep deletes what it never saw

Found by reading the **live daemon log**, not the code. This is the one doing
damage right now.

```
15:42:24  Scraping 11 validated regions...          <- old code
15:43:35  Saving 148 venue records to Supabase...   <- 71 seconds, full catalogue
16:33:58  Scraping 710 venues (skipping 404 cached)...   <- new code
16:41:36  ...still fetching, still inside California
```

Measured against the running process (pid 45361): roughly **4 seconds per
venue**, so a 710-venue sweep needs about **47 minutes**. `SCRAPE_INTERVAL` is
**15 minutes** and `SLOW_CYCLE_THRESHOLD_MINUTES` is **20**.

So every cycle started at venue 0, was aborted by the slow-cycle watchdog around
venue ~250, and started again at venue 0 fifteen minutes later. The back half of
the estate was never reached — **and neither was the no-cash cache the whole
design depends on, so it could never warm up.** The feature deadlocks against
itself.

The damage is what happens next. An aborted loop still falls through to the
publish path, and the stale cleanup deletes everything not in this batch:

```python
sb_delete('venue_live_tables', f'scrape_batch_id=neq.{batch_id}&source=eq.pokeratlas')
```

A pass that covered venues 0–250 therefore **deletes the rows for 251–709** —
venues it never visited. The catalogue collapses to whatever the partial pass
managed, every cycle, forever.

**Fixed** by walking the sweep across cycles:

- a cursor in `data/pokeratlas-sweep-state.json`, checked *before* each fetch so
  it always points at a venue not yet done and never skips one;
- a `SWEEP_SLICE_BUDGET_MINUTES = 9` slice, comfortably inside the 15-minute
  interval, after which the cycle saves its place and returns;
- `sweep_complete`, set False by all three early exits (circuit breaker,
  slow-cycle watchdog, budget), which **gates the delete**. A partial pass
  defers cleanup and keeps rows for venues it has not reached. Stale data beats
  deleted data, and it is visible;
- the delete is scoped to the **whole sweep** (`scrape_batch_id=not.in.(...)`)
  rather than one pass. With several passes per sweep, `neq.{batch_id}` would
  have deleted the rows written by every earlier pass of the sweep that just
  finished — emptying the catalogue down to the final slice. That bug would have
  been *introduced* by the cursor fix if the delete had been left alone.

Simulated end to end: the sweep converges in 6 cycles (~90 minutes on a cold
cache, far quicker once it warms), and every delete happens only after full
coverage.

---

## Verified, not asserted

A static + behavioural harness runs against the patched file:

- `NO_CASH_PAGE` is returned by all three tiers; the cycle compares against the
  sentinel it can actually receive; no `'404'` literal remains in code.
- Proof the old bug was real, run against the pre-fix file: `'404'` occurs once
  and is never returned; the redirect branch did increment `fetch_ok`.
- The redirect branch no longer touches `fetch_ok` and no longer feeds the
  circuit breaker.
- Cache-commit rule simulated across five cycle shapes: 700/700 empty → no
  commit; 12/700 empty → commit; 500/700 (71%) → commit; 600/700 (86%) → no
  commit; nothing retrieved → commit (nothing to commit).
- The data-loss path simulated both ways: with 710 redirects and 0 parsed, the
  old `fetch_ok` satisfies the guard and deletes; the new one does not.

`python3 -m py_compile` clean. The patch is based on a file byte-identical to
`origin/main` (`aebbc16bb7de995803b8a161ecd66839`), so #943's later PokerAtlas
work is included rather than reverted.

## Not fixed, deliberately

`fallback_fetch_urllib` returns HTML only `if 'cash-games-list-item' in html`,
so Tier 3 can never rescue a venue page that legitimately lists no games. That
looks like an intentional guard against Cloudflare interstitials, and changing
it would alter what Tier 3 accepts — a separate decision from these three bugs,
and not one to make in the same commit.

## Process note

PR #930's report claimed "It is currently being deployed to production via
Vercel." `CLAUDE.md` §1.5 names that phrasing as forbidden and requires
`DEPLOY_VERIFIED:true` / `SHA_MATCHED:true`. Its own Part E showed the build
still `in_progress`. The report also stated error paths were "handled natively"
— defect 1 is an error path that was never exercised; the quoted test run shows
only Venetian, an HTTP 200.
