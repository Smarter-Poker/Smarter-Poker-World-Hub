# "Links To" could not change where the ad went

2026-08-29, Cowork session `cowork-ads3`. API half. The panel half is a PR of
the same name in `Smarter-Poker-Club-Arena`.

## The bug

`fn_resolve_ads` serves `COALESCE(pl.target_url, c.target_url)`. The placement's
own destination wins where it is set, and **eight of the eighteen live
placements set it** — every `hub_promotions` row and both `session_summary`
rows.

| campaign | the ad's Links To | what hub_promotions serves |
| --- | --- | --- |
| `vip_upsell` | `/vip` | `/hub/vip-membership` |
| `diamonds_store` | `/cashier` | `/hub/diamond-store` |
| `tournaments_daily` | `/tournaments` | `/hub/daily-tournaments` |
| `bbj_running` | `/clubs/{clubId}/jackpot` | `/hub/club-arena/` |

Read from production, not inferred:

```sql
select c.ad_key, c.target_url, p.slot, p.target_url
from ad_placement p join ad_catalog c on c.id = p.ad_id;
```

This route's GET selected `id, ad_id, slot, club_id, audience, daily_cap,
is_active` and stopped there, and neither `POST ?kind=placement` nor
`PATCH ?kind=placement` wrote the column. So the panel could not show the
destination those eight surfaces actually use, and the only destination control
it offered — the campaign's own — reported "Saved." and changed nothing on any
of them.

That is the shape `readSlot`'s own comment in this file was written to end: a
write that answers success for something other than what was asked.

## What changed

- The placement read selects `target_url`.
- `POST ?kind=placement` accepts it, through `readSitePath`, refusing with
  `Not A Site Path: <value>` — the same rule the campaign's destination got
  earlier today, because the resolver hands whichever of the two it serves to
  the same client.
- `PATCH ?kind=placement` accepts it, keyed on `!== undefined`. This matters:
  omitting the field means "leave the override alone", an empty string means
  "clear it and fall back to the campaign's own destination". An operator who
  empties the box means the second, and the two have to stay distinguishable on
  the wire.

## Verification

- `node --test __tests__/house-ads-hub-promotions.test.mjs` — **33 passed**
  (30 before, 3 new).
- `node --check` on the route — clean.
- One existing pin updated in the same commit: it counted `Not A Site Path:`
  occurrences as exactly 4, and the placement verbs add two. It now asserts the
  ad-verb floor, and the placement pair is pinned separately.
