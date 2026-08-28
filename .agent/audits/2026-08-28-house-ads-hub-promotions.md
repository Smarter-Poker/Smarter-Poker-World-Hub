# House Ads Phase 2 — the World Hub gets an ad surface

**2026-08-28.** The `hub_promotions` slot was declared in Phase 1 and wired to
nothing. The World Hub had no ad surface of any kind. It has one now.

The Club Arena half of this work (the migration production had already run, and
the browser-verified click) is recorded in
`club-arena/docs/changelog/2026-08-28-house-ads-hub-promotions.md`.

---

## What shipped here

| File | What it is |
| --- | --- |
| `src/lib/hubAds.js` | The Hub's ad client: resolve via `fn_resolve_ads`, log to `ad_event` |
| `src/components/ui/HubPromoStrip.js` | One quiet line of house inventory |
| `pages/hub/index.js` | Renders it, inside a `HubErrorBoundary` |
| `__tests__/house-ads-hub-promotions.test.mjs` | 11 source-pinned guards, added to the `prebuild` gate |

## Why a second client instead of importing Club Arena's

Club Arena is a different repository and a Vite SPA; this is Next.js. Importing
across them would couple the two builds and give the estate one more thing that
breaks where nobody is looking. The two clients are small and behave
identically on purpose, but what they are required to share is not code, it is
the contract: the same `fn_resolve_ads` RPC and the same `ad_event` table, so
both surfaces are comparable in one place.

## Why the strip sits where it sits

`/hub` is a fixed, full-viewport 3D carousel whose cards occupy the bottom
third. The band between the sticky header and those cards is empty background.
The strip renders in normal document flow immediately after the header, which
places it in that band and moves nothing: `WorldHub`'s root is
`position: fixed`, so it neither reflows nor shifts. The strip is above the
canvas and below the header and every menu.

That is the same argument as the `empty_state` slot: it fills space that is
genuinely dead, rather than displacing something a player came for.

## The rules it inherits, and the guards that hold them

- **Targeting is server-side.** Every eligibility rule stays in
  `fn_resolve_ads`. A test fails the build if `is_vip`, `audience` or
  `daily_cap` ever appear in the client. The day a paying advertiser arrives,
  an impression a browser decided to serve itself is a billing dispute.
- **Impressions de-duplicate per page load, not per render.** The strip rotates
  on a timer; counting renders would divide every campaign's click-through rate
  by a meaningless number.
- **The click is logged before the navigation** that would unmount the strip. A
  test pins the ordering. Losing the event to the unmount is exactly how a
  working click path ends up looking like nobody ever clicked.
- **VIPs see ads.** Dan 2026-08-27: "even vips will see ads remove that for
  now." No suppression here, and no re-advertising of an ad-free tier either.
- **No emoji.** Glyphs only, from the catalog. The test's range deliberately
  excludes U+2600-U+27BF, because the house glyph set includes U+2605.

## Two things this adds that Phase 1 did not have

**A dismiss that cannot become permanent.** The strip can be hidden, which logs
a `dismiss` row and lasts until the next page load. It is deliberately not
persisted. PR #1505 (club-arena) was a deterministic per-id flag that never
rotated, combined with an "already covered" rule: together they made an
absorbing state that killed every Spin and Heads-Up on the platform for twenty
hours, and every refusal on that path returned silently. A suppression that
never expires and cannot be counted is that same mechanism. This one does both.

**A destination check at the point of navigation.** The migration asserts every
`hub_promotions` destination is Hub-absolute and refuses to apply otherwise.
This is the second lock: same-origin paths only, never a protocol, never a
protocol-relative `//host` that a browser reads as another site. An ad
destination is data, and data that decides where a browser goes is checked
before it is obeyed.

## Verification

```
node --test __tests__/house-ads-hub-promotions.test.mjs      11 passed, 0 failed
```

The test is registered in `package.json`'s `prebuild`, so it runs on every
build rather than only when someone remembers it.

Post-merge, the surface is confirmed the only way that counts: a row in
`ad_event` with `slot = 'hub_promotions'`. Before this change that table
contained 131 rows and every one of them said `lobby_strip`.
