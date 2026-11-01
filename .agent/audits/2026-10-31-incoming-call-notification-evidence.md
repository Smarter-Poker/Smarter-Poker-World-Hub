# Incoming-call notifications, Turn On Notifications and client upgrades: evidence (2026-10-31)

Dan reported that a ringing call showed nothing anywhere except inside
Messenger, and that Turn On Notifications was gone from the hamburger menu.

## The 20:50 UTC call (kingfish to Danimal), read from production

- Client: `supabase-js-web/2.90.1` is Club Arena; World Hub is `2.112.4`.
- Danimal's iPhone (iOS 18.7, Safari 26.6) was playing in **Club Arena** from
  20:30 to 20:41, then made no requests until 20:50:04, when a World Hub page
  checked `/api/calls/pending` (Supabase edge logs).
- The call was created at 20:50:20. The next pending check came at 20:50:35,
  and the answer at 20:50:38 was a room-scoped cancel. Only the new
  CallProvider sends a room-scoped cancel, so the device ran current code:
  **not a stale client**. The ring signal never reached the page; a page load
  found the call.
- The call's push went to Danimal's only subscription, an **iPad** that has
  not confirmed a displayed push since 2026-08-31. The iPhone in use had no
  subscription. kingfish's iPhone subscription last confirmed on 10-23.
  Another member's iOS subscription confirmed at 21:07 the same day, so iOS
  delivery works in general.
- The receipt written at 20:52:58 produced a "Message from kingfish /
  [CALL_RECEIPT]{...}" notification and push.

## Fixes (all through protected merge)

| PR | What |
|---|---|
| World Hub #2627 | Ringing call written as an `incoming_call` bell row plus the push; CallProvider rings from that row too; the row is removed when handled; receipts never notified as messages; hamburger Turn On Notifications |
| World Hub #2632 | Re-check pending calls when realtime rejoins, on `online` and `pageshow`; the menu row follows the real push state (ask / install / blocked / hidden); an open page looks for a new build when shown and every 15 minutes; an update never reloads under a call |
| Club Arena #8999 | Turn On Notifications in the Club Arena hamburger, same states |
| Club Arena #9022 | Incoming-call alert anywhere in Club Arena from the same bell row; answer in a "+" hub tab when tables are live |

## Live verification (throwaway example.com users only)

- **Run 41244140978, live f75ccd0d (ring everywhere):** six non-Messenger
  pages on Android-sized Chromium and WebKit 27.2, service workers allowed.
  All 12 combinations rang; a bell row appeared and was gone after decline.
- **Run 41250392204, live 1e8650c8, part B (ringing):** all passed:
  - after client navigation;
  - after a 20 s network drop;
  - called while offline, rang on reconnect;
  - called while frozen and offline, rang on return;
  - answered (two-way);
  - unanswered: one missed-call notice and one missed receipt.
  Every call had one bell row, cleared afterwards, and no raw receipt alert.
- **Run 41252155283, live 7fe722f7, part A (menu):** real Chrome enrolment
  from the menu worked:
  - FCM subscription created and stored server-side;
  - success toast shown;
  - row hidden once enabled.
  - Emulated states: denied opened Settings, Notifications; an iPhone Safari
    tab opened `/hub/install`; an unsupported desktop browser saw no row.
- **Run 41252778117, live d5ae64a8, part C (push chain, app closed, headed
  Chrome 156 under xvfb):**
  - **Server acceptance:** exactly one incoming-call push, sent, accepted by
    FCM.
  - **Worker display:** `showNotification` with Accept and Decline, and the
    receipt recorded. This is not a banner a person saw.
  - **Accept:** the notification's Accept URL answered the call with two-way
    video.
- Enrolment needs Chrome's separate `push` permission and background
  networking. Headless Chrome and Playwright's default flags refuse it (runs
  41250392204 and 41251100828); that is a test-harness limit, not a product
  defect.

## Old-to-new upgrade observations (real production deploys)

Vercel deployment URLs are behind SSO, so the test opens pages on the live
build with the service worker in control and keeps them open across the next
real deploy. `__NEXT_DATA__.buildId` is the same on every release
(`build-TfctsWXpff2fKS`), so reloads are identified by `performance.timeOrigin`.

| Run | Deploy | Open pages afterwards |
|---|---|---|
| 41249365700 | 037dcf17 -> 1e8650c8 (pages on the pre-fix build) | no update for 4 minutes, including the page hidden and shown every minute; both reloaded only after a fresh page load fetched the new worker |
| 41250843386 | 1e8650c8 -> 7fe722f7 (pages on the fixed build) | both reloaded about 5 s after the deploy, on the first hide-and-show |
| 41252779970 | d5ae64a8 -> 9461f04f | both reloaded 4 s after the deploy, then once more 4 minutes later with no new deploy (`/sw.js` is now byte-stable across six fetches; the imported `/worker-*.js` is the remaining suspect) |

| 41258734166 | 73b6c0e7 -> 090f1789 | draft page held its typed text and call page held its connected call, each reloading the moment the text was cleared or the call ended; the idle page never reloaded because every field on the page counted as a draft (fixed in #2645: only text a person typed holds an update) |
| 41262339099 | b570ed48 -> 619237a9 | passed: idle page reloaded; draft kept its text and call stayed connected while held (`held-draft`, `held-call` in the updater's decision log); each reloaded after clearing or hang-up; a call rang afterwards |

Calls rang on every open page after every deploy.

The "second reload" in 41252779970 was a second real deploy: ae604417 was
ready at 23:45:00 and the pages reloaded at 23:45:23. It is not a stale
worker. Run 41262339099 also showed each reload as three main-frame
navigations within half a second; those were the router's same-document URL
replaces, and the receipt now counts document loads (#2647).

## Club Arena (run 41261469643, Club Arena ba152e40f)

- A running cash table observed by the test account stayed live through a
  call made to that account: `data-ca-live-tables` 1, the table fingerprint
  kept changing, no "Reconnecting To The Table", before and after the call.
  The ringing row was gone after hang-up.
- The in-Club-Arena call alert and the menu's Turn On Notifications row were
  not on the published bundle (Club Arena PRs #8999 and #9022 not yet merged),
  so those steps failed as expected. A brand-new account also meets Club
  Arena's Terms of Service screen first; the suite now enrols as the test
  account, which has accepted them, and removes only the subscription it made.

## Not proven here (physical device only)

A banner a person sees on an iPhone or iPad, tapping it and Accept,
front/back camera flip, the real keyboard, and minimize/restore audio. Suite
`messenger-calls-device` conducts that test with one throwaway partner.
