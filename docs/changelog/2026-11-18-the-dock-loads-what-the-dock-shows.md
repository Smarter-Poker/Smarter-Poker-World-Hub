# 2026-11-18: the Messenger dock loads what the dock shows

Dan, from a Club Arena poker table: "FIX WHAT EVER IS CAUSING THE SIGNAL TIME
OUT ERROR", with a screenshot of `signal timed out` in red above the chat
button.

## Root cause

`signal timed out` is the browser's own text for a request that passed the
dock's 30 second ceiling (`AbortSignal.timeout(30000)` in
`bindDockRequest.mjs`). The request was the dock refresh:
`POST /api/messenger/get-conversations` with `{ workspace: 'dock' }`.

The dock refreshes on mount, on every tab focus, on reconnect and on every
incoming message. Each refresh ran the FULL inbox loader
(`getMessengerWorkspace`) once for the personal inbox and then twice for every
club, once per folder, over the same rows. The full loader reads thread details
and the two accounting authority functions for every thread the person has
ever had, 100 at a time, each batch in sequence.

Measured in production on the owner account: 6 active clubs and 5,895
conversation participations (1,390 + 1,373 + 1,303 + 972 + 855 + 2 by inbox).
The inbox function itself is fast (683 rows in 0.08 s). The cost was the
waterfall after it: several hundred sequential database round trips per
refresh. Modelled in the new test with the same shape, the old code asked for
thread details 36,200 times in one refresh.

The same request also printed its failure over the page, which is fixed in the
dock component (same change in the Club Arena copy).

## Fix

`src/lib/messengerWorkspace.mjs`, dock and feed only. Nothing about who may see
what is changed, and the full Messenger page still lists everything.

1. **One load per club serves both of its folders.** `messages` and `invoices`
   were always the same rows filtered two ways; the loader now returns both
   from one pass (`folders`, internal to the dock).
2. **The dock asks only for what it shows** (`DOCK_RECENT_LIMIT`,
   `dockInboxSlice`): every thread with something unread, every empty staff
   notice group, and the 30 most recent of the rest, per inbox. Unread counts
   are unchanged because every unread thread is still read.
3. Clubs load four at a time instead of two.

`dockFailureText` (dock component): a transport failure is said plainly, a
message the API wrote is kept, and a background refresh reports inside the open
inbox with Retry instead of floating over the page.

## Regression lock

`__tests__/messenger-dock-bounded-load.test.mjs`, added to the required
Messenger step of `build-safety-gate.yml`: a 9,700-thread, six-club account
refreshes in a bounded number of round trips; every unread thread (placed as
the OLDEST in each inbox) is still returned with the exact unread count; each
club is read once; the Messenger page and the feed are not sliced. Three of the
six cases fail on the previous source.
