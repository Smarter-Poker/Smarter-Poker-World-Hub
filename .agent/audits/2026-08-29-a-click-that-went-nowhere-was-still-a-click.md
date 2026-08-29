# A click that went nowhere was still a click

2026-08-29, Cowork session `cowork-ads3`. World Hub half. The Club Arena half
is a PR of the same name in `Smarter-Poker-Club-Arena`.

## How this was found

The house-ads handoff of 2026-08-28 closed on a standard: read your own merged
diff and ask "is every new function actually called, and does every write do
what it says?" I asked it of the whole ads surface, client and server. Four
things answered badly. Three are fixed here.

## 1. `target_url` was validated by every client and by nothing that wrote it

Every reader already refuses a destination that is not a rooted, same-origin
path — `isSafeAdTarget` in Club Arena, `isSafeHubDestination` on the Hub. The
write path had no check at all: `clean(b.target_url, 300)` on POST and on
PATCH, straight into the column.

So `https://anything` typed into the admin panel was accepted, stored, served
by `fn_resolve_ads`, rendered as a tappable promotion, counted as a click, and
refused at the last moment by the browser that received it. The ad looked live
everywhere an operator could see it and was dead everywhere a player could.

`readSitePath()` now applies the clients' own rule where the value is written,
on both verbs, and returns a 400 naming the value. It rejects protocol-relative
URLs and backslashes for the same reasons the client does — browsers normalise
`/\evil.example` toward `//evil.example`.

## 2. Both Hub clients logged the click before they checked the destination

```js
logHubClick(visible.adId);
if (!isSafeHubDestination(visible.targetUrl)) return;   // too late
```

The click is still recorded before navigating — losing the event to the unmount
is how a working click path ends up looking like nobody ever clicked — but now
after the check.

These events are worse than no events. In the panel they are indistinguishable
from a campaign that works, and they inflate the click-through rate an operator
reads when deciding what to run next, on exactly the campaigns that are broken.

## 3. An out-of-origin image was discarded in silence

`cleanImageUrl` called itself "the courteous refusal" and refused nothing:
outside host in, `null` out, row saved, 200, "Saved.", field empty. That is the
silent-write shape this same file's `readSlot` comment was written to end.
Replaced by `readSitePath`, which refuses out loud.

## Also

- **Create clamped weight to 0 against a database that requires `> 0`.** PATCH
  already clamped to 1 and explained why; create was missed. A cleared number
  box sends 0 (`Number('') === 0`, and it is finite), so the operator got
  "Could not create that ad" naming no field. Floored at 1.
- **`created.id` on a null row.** `.maybeSingle()` answers a row the connection
  cannot read back with `{ data: null, error: null }`; reading `.id` threw, and
  the catch turned an ad that may well have been written into a bare "Internal
  server error". Now says what happened and what to check.

## Verification

- `node --test __tests__/house-ads-hub-promotions.test.mjs` — **30 passed**
  (24 before, 6 new). Registered in `package.json` prebuild.
- `node --check` on the route, esbuild on both components — clean.
- One existing pin updated in the same commit: the image test named
  `cleanImageUrl`, which no longer exists. It now names `readSitePath` and
  asserts the old function is gone.
- Live check before claiming anything: no row in `ad_catalog` currently carries
  an unsafe `target_url` or `image_url`, so none of the 589 ad events recorded
  to date is a phantom click. This closes the path before it was walked.

## Left open

`ad_placement.target_url` is a per-placement override that `fn_resolve_ads`
prefers over `ad_catalog.target_url`, and **eight live placements carry one**
(every `hub_promotions` row, and both `session_summary` rows). The GET does not
select that column and neither placement verb writes it, so editing "Links To"
on those campaigns reports "Saved." and changes nothing on the surface that is
actually serving. It needs the read, a field in the placement row, and both
verbs. Filed, not fixed.
