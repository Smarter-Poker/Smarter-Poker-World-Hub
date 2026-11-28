# Poker Near Me Discovery Tools request flood (2026-11-28)

## Symptom

A signed-in phone session on `https://smarter.poker/hub/poker-near-me/more`
made so many requests that the browser dropped about 1,700 of them within a few
minutes. The resource timing buffer (250 entries) filled, and dozens of
`/api/poker/checkins?venue_id=...` calls were visible.

## Root cause

Every surface on the page stacks into one document, so the Discovery Tools share
the page's state. The page's map directory (`allVenuesForMap`) was rebuilt as a
new array, with a new object for every fetched venue, every time `venues` changed
identity. That happens on the venue poll (5 min), each live-data merge, the
saved-GPS restore, the fresh GPS fix, the post-geocode refetch, and the cache and
network directory loads. Several tools keyed their fetch effects on that array, or
on the `userLocation` object, rather than on what they read:

- **Near Me Now** re-ran all four sources on each change, and its check-in source
  sent one request per nearby venue (up to 20). That is 24 requests per re-run.
- **Social Feed** re-ran its per-friend check-in fan-out (up to 50 requests) on
  each venue change, because venue names were joined inside the fetch. It also
  asked for the friends list once without a token (a guaranteed 401) and again
  when the token arrived.
- **Ratings** (the page's review stats fan-out) cancelled and discarded the
  in-flight chunks on each venue change and asked for the same ids again. Ids
  with no reviews were asked for on every venue change, forever.
- **Best Time To Go** refetched `/api/poker/peak-activity` (with a skeleton
  flash) on every `live_tables` bus announcement. The Live Games feed announced
  after each 2-minute poll, and twice per realtime burst.
- **Live Games realtime** used a 2-second debounce, so a steady trickle of
  `venue_live_tables` row events refetched every few seconds for as long as the
  trickle lasted.
- **Player Planning** reloaded the private plan list on any `storage` event from
  another tab, whatever key changed.
- The page and Live Games both read `/api/poker/live-tables` on mount.

Estimated per session, signed in with GPS and about 10 friends, Discovery Tools in
view: 6 to 8 directory identity changes in the first minute give about 150 to 190
Near Me Now requests and about 70 to 80 Social Feed requests. Ratings re-runs come
on top of those. After that, each poll adds about 35 more. Background
announcements add the heatmap reloads.

## Fix (root, no watcher)

| File | Change |
|---|---|
| `src/components/poker-near-me/discoveryController.js` | `mergeLiveVenuesIntoMapDirectory` keeps every unchanged venue object and returns `prev` when nothing changed. Nested fields are compared by content. |
| `pages/hub/poker-near-me/[pnmTab].js` | Uses that merge. Ratings track requested ids in a ref, keep answers when the list changes mid-flight, and drop them only on unmount. A failed chunk can be asked for again. The live-tables merge read goes through `fetchShared`. |
| `src/components/poker-near-me/NearMeNowFeed.jsx` | The fetch is keyed on `nearMeFeedKey`, meaning the in-radius venue ids nearest first, plus the coordinates as numbers and the radius. It reads the latest list from a ref. Check-ins are one batched `venue_ids=` request for numeric catalog ids, with `since` floored to the minute so the URL can be cached. |
| `pages/api/poker/checkins.js` | New batched GET mode `venue_ids=1,2,3`, capped at 25. Over-long or invalid lists get a 400, never a silent truncation. It uses the same public visibility, the same 24h ceiling with `since` narrowing it, and the same 100 rows per venue. The answer is one query, paged by 1000 rows, returning `{ success, venues: { [id]: { checkins, count } } }`. The single-venue branch is unchanged (shared `resolveVenueWindowStartMs`). |
| `src/components/poker-near-me/SocialLayer.jsx` | The fetch is keyed on friend ids, and venue grouping is derived at render. The friends list waits for the token to settle. |
| `src/components/poker-near-me/PeakActivityHeatmap.jsx` | Bus-triggered refetch is silent and at most once per 5 minutes, matching the API's s-maxage of 300. |
| `src/components/poker-near-me/LiveGamesFeed.jsx` | Realtime refetch is a throttle with a 60 s floor (the API's s-maxage of 60) that is never pushed back. The duplicate bus announcement from the event handler is removed. The live-tables read goes through `fetchShared`. |
| `src/components/poker-near-me/PlayerPlanningPanel.jsx` | Reloads only for the auth key or `storage.clear()`. |
| `src/lib/poker-near-me/sharedGet.js` | New. Coalesces concurrent identical GETs and caches nothing after they settle. |

After the fix, Near Me Now costs 4 requests per real input change (down from 24
per re-render), and the Social Feed costs 1 plus 1 per friend per real change of
the friends list.

## Tests

`__tests__/pnm-request-flood.test.mjs` (added to `npm run test:pnm`) renders
Near Me Now, the Social Feed and the heatmap with a fetch spy. It also runs the
API handler against a fake query builder, the directory merge and the coalescer.
The three component tests fail against `origin/main`'s components and pass now.

## Left alone

- The Social Feed still reads check-ins once per friend (`user_id=`). Batching
  that would need the per-friend friendship authorisation in the handler done in
  bulk. It now fires once per friends-list change instead of once per render.
- `useVenueRealtime`'s 5-minute venue poll and Live Games' 2-minute poll stay.
  Both are product cadences and pause while the tab is hidden.
- Not verified in a real browser. The request counts above are estimated from
  the code, not measured on a device.
