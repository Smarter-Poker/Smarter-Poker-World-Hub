# 2026-09-09 - the ad click redirect, and why it cannot be an open redirect

Companion to Club Arena `agent/cowork-ads4/feat/sponsor-campaigns`
(migration `20260909071146_a_sponsor_sends_traffic_to_its_own_site`).

## What this repo gained

`pages/api/c/[code].js`, reached at `/c/<code>` through a rewrite in
`afterFiles`. It is the **first `res.status(302)` route in this repo** - every
other redirect here is a `next.config.js` entry or a client-side
`router.replace` - so it was written from scratch rather than copied.

## The security question, and the answer

An outside sponsor needs to send a player to their own site. Every ad
destination on this platform is a rooted path on smarter.poker, checked in four
independent places (`ad_catalog` CHECK, `readSitePath` in
`pages/api/club-arena/house-ads.js`, `isSafeAdTarget` in Club Arena,
`isSafeHubDestination` in `src/lib/hubAds.js`). All four are correct and none
was weakened.

The address is not what travels. It lives on `ad_campaign.external_url`; the
campaign carries an opaque `click_code`; the advert points at `/c/<code>`, which
every one of those four checks reads as the rooted path it has always read.

**This route accepts no URL.** It takes the code and asks
`fn_ad_click_redirect` for the address approved against it. OWASP's rule is
"never send a browser to a user-supplied address", and the way this obeys it is
by never accepting one - there is no `?url=`, `?next=` or `?return_to=` to
abuse. An invented code gets the lobby. A guessed code still only reaches an
address a human approved in the review queue.

Exactly two `Location` values are reachable, and the test pins that there are
two: the https address from an approved, in-flight campaign, or `/hub/club-arena`.
A non-https value arriving from the database is refused a second time here,
over the column's own CHECK, and reported.

## Two decisions worth knowing

- **`no-store`.** A cached redirect is a click that quietly stops being
  counted: the browser stops asking and the advertiser's number flattens.
- **The click is recorded server-side, and the browser deliberately does not
  record it.** The page is being torn down as the request leaves, which is the
  least reliable place to count the one number an advertiser can dispute.
  Counting in both places would bill a sponsor for double.

## A limitation stated rather than papered over

The click is attributed to **nobody**. This is a top-level navigation with no
Authorization header, and the Supabase session lives in localStorage rather
than a cookie, so the server cannot tell who it is. Letting the client append
a user id was refused twice over: it would be trivially forged, and it would
put a person's id in a URL handed to a third party. `ad_event.user_id` is
nullable for exactly this - the click counts, it just counts toward nobody.

## Not changed

`fn_ad_click_redirect` is `service_role` only; this route holds the only key
that can call it. Without `SUPABASE_SERVICE_ROLE_KEY` it says so and sends the
player to the lobby rather than falling back to a role the database will refuse.

## Verified

`node --test __tests__/house-ads-hub-promotions.test.mjs`: 37 pass, including
the new pin that no URL parameter enters the route, that the code shape is
checked before the query, that only https ever leaves, that `no-store` is set,
that exactly two `Location` values exist, and that the rewrite is in
`afterFiles`.
