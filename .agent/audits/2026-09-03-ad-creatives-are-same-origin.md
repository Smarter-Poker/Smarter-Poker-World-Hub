# 2026-09-03 - ad creatives are same-origin, and the placement owns its picture

Companion to Club Arena PRs `agent/cowork-ads3/feat/image-ad-rotator` and
`agent/cowork-ads3/feat/club-advertising` (Dan 2026-09-03: three rotating
picture ads on the lobby strip and the session summary; club owners buy
flights in diamonds).

## What this repo needed

1. **`/ad-creatives/:path*` rewrite** (afterFiles, `next.config.js`) to the
   `ad-creatives` storage bucket. A club owner's upload is stored on the
   campaign as `/ad-creatives/club/<club id>/<file>`, a rooted path on
   smarter.poker. The three same-origin locks on ad images (the
   `ad_catalog` / `ad_placement` CHECK, `readSitePath` in
   `pages/api/club-arena/house-ads.js`, and `isSafeAdImage` at render in
   both clients) all insist on exactly that shape; this rewrite is where
   the path resolves to bytes. Without it every check passes and every
   picture 404s.
2. **`ad_placement.image_url`** in the house-ads API: read in GET, accepted
   on `POST ?kind=placement` and `PATCH ?kind=placement` through
   `readSitePath` ('' clears, absent leaves alone, an outside host is a 400
   naming the value). The lobby strip is 6:1 and the session summary 3:1;
   one catalog picture cannot serve both, and the resolver already serves
   `COALESCE(pl.image_url, c.image_url)`.

## Not changed here

`HubPromoRail` still renders a 34px thumbnail on `/hub/promotions`; the
16:9 hero treatment proposed in Club Arena's
`docs/ads/AD-SURFACES-AND-CREATIVE-SIZES.md` is a separate piece of work.
`fn_resolve_ads` gained `placement_id`, `advertiser_kind`, `advertiser_name`
columns; `src/lib/hubAds.js` maps by name and ignores them, so nothing on the
Hub breaks, and nothing on the Hub labels a club or sponsor creative yet.

## Verified

`node --test __tests__/house-ads-hub-promotions.test.mjs`: 36 pass (two new
pins: the placement image round-trips through the API; the rewrite exists,
is in afterFiles, and `public/ad-creatives` does not exist to shadow it).
`tests/club-arena-is-a-rewrite.test.mjs` unchanged and green.
