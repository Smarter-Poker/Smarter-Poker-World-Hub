# 2026-09-13 - An advert is a picture everywhere, and a tap opens it full screen (World Hub half)

Branch `agent/cowork-ads5/feat/ads-are-pictures-everywhere`. The Club Arena
half (resolver, schema, rotator, interstitial, creatives, law) is the same
branch name in that repo, changelog
`docs/changelog/2026-09-13-an-advert-is-a-picture-everywhere.md` there.
Migration `20260913182547_an_advert_is_a_picture_everywhere_and_a_tap_opens_it_full_sc`
is applied to production.

## What Dan asked for

Verbatim: "MAKE SURE YOU MAKE THE STANDARD FOR ADS EVERYWHERE INSIDE OF
SMARTER.POKER TO BE RESPONSIVE FLUID IMAGES ONLY! AND ANY TIME THEY ARE
CLICKED THEY SHOULD BE OPEN AND DIRECTED TO WHATEVER THE AD IS DISPLAYING AS A
FULL SCREEN POP UP AS WELL."

## What changed here

**`src/components/ads/HubPromoRail.jsx`** - rewritten. It was a text card
(tag, headline, two-line body, CTA) with a 34px `object-fit: cover`
thumbnail. It is now one responsive fluid picture: a box `width: 100%` with
`aspect-ratio: 16 / 9` and the creative `object-fit: contain` inside it -
it shrinks with the page and is never cut off or distorted. Three rotate on
a 7s timer with dots. No text on the surface; the headline is the accessible
name. An advert with no same-origin picture is dropped before render, and a
creative that fails to load drops its advert rather than falling back to
text.

A tap opens `HubAdInterstitial` in the same file: `position: fixed; inset: 0`,
`role="dialog"`, the poster (`poster_url`, falling back to the surface
creative) contained in a box that reads the picture's real shape, the
headline as a caption, "From Smarter Poker" / "Sponsored By X", one CTA
button, Close. Escape closes, focus lands on Close, body scroll is locked,
the fade collapses under reduced motion. The tap logs nothing. The button is
the click: internal destinations log then `router.push` (or
`window.location.assign` for the Club Arena SPA, as before); a sponsor
destination (`/c/<code>`) opens in a new tab with `noopener,noreferrer` and
is NOT logged here - the redirect counts it. Closing without going is a
dismiss. Rotation holds while the popup is up.

Why the popup is the advert and not the destination page in a frame: five of
six house destinations are Club Arena routes, which must never be framed
(Club Arena CLAUDE.md 1.3); a sponsor's site refuses framing as a matter of
course, and its address never reaches the client anyway.

**`src/lib/hubAds.js`** - maps `poster_url`, `advertiser_kind`,
`advertiser_name` from `fn_resolve_ads`; adds `AD_CLICK_PREFIX = '/c/'` and
`isExternalAdClick`, the same rule as Club Arena's.

**`pages/api/club-arena/house-ads.js`** - `poster_url` accepted on ad POST
and PATCH through `readSitePath` (same-origin, 400 on refusal, ten "Not A
Site Path" sites now). The catalog read also returns `image_url`,
`poster_url` and `experiment_key`: it never returned `image_url`, so the
composer's edit form loaded the picture field empty and a Save wrote it back
as NULL. That was a pre-existing defect found while wiring the poster.

**`__tests__/house-ads-hub-promotions.test.mjs`** - six pins rewritten to the
new shape (the navigation reads `target`, the dismiss reads `ad.adId`, the
link is the picture), the "Not A Site Path" count is 10, and four new tests
pin the standard: fluid contained picture and no text, tap opens full screen
and the button does the going, sponsor leaves in a new tab uncounted here,
and the catalog poster round-trips through the API.

## Creatives

The 16:9 `hub-promotions` files for all six campaigns live in the Club Arena
repo under `public/assets/ads/` and are served through the
`/hub/club-arena/*` rewrite; the placements point at
`/hub/club-arena/assets/ads/<key>-hub-promotions-v1.webp`. Nothing is added
to this repo's `public/`.

## Verified

- `node --test __tests__/house-ads-hub-promotions.test.mjs`: 41 pass, 0 fail.
- `eslint` on the three files: 0 errors (two pre-existing catch-block
  warnings).
- Resolver on production returns 13 columns including `poster_url` for
  `hub_promotions` (checked from the Club Arena side when the migration was
  applied).
