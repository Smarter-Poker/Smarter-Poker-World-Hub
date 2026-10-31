# Messenger calls: preserved two-device evidence and physical-device plan (2026-10-31)

## Preserved evidence: run 41236048552

- Workflow: `e2e-tests.yml`, suite `messenger-calls-live`, run 41236048552.
- Verified live revision: `c09a45d89e3453d8be45cd8ffdc0499e846ebe37`
  (Vercel deployment `dpl_XgFL37mdFf6MMdR9ZMg4nPjKUjrk`, `/api/health` matched).
- Result: `passed-with-blocked-browser-cases`, 16 PASS, 1 BLOCKED, 0 FAIL.
- The artifact `messenger-calls-live-receipt` (id 13056300666) expires 2026-11-07.
  Its `result.json` is kept here verbatim:
  `2026-10-31-messenger-calls-evidence/run-41236048552-result.json`
  (sha256 `9ab6a64f372a114b025a8b233c8cee0da8170a7d5130b2d656cd6d70b9eadbe0`;
  no credentials, the account appears only as a fingerprint).
- Cleanup in that run: both throwaway users deleted, thread, messages,
  pending calls, notifications and push outbox rows removed.

Passing cases (emulated devices, real published app, real LiveKit and
Supabase): mobile header with long name; ringing outside Messenger; two-way
video and audio; mute; camera off/on; minimize, switch chats and leave
Messenger with audio continuing; hang-up with exactly one receipt; second
incoming call without reload and decline; floating-chat call buttons;
unanswered timeout; unrelated user refused; offline callee told Not
Reachable; push Accept route with two-way media (mobile Chromium); exactly
one receipt per call and one missed-call notice; 320px composer.

Blocked: mobile WebKit (Playwright 1.62.1, WebKit r2336 "26.5") logged
`Invalid TURN URL query string` and the LiveKit signal join failed.

What that run did not prove (stated in its own `limitations`): Safari on a
physical iPhone, a real phone push, front/back camera switching, a real
on-screen keyboard.

## WebKit attribution, verified rather than assumed

WebKit bug 320931: commit 316873@main ("Improve TURN server URL checks",
bug 318948) began rejecting TURN URLs that carry a `?transport=` query,
which RFC 7065 allows and LiveKit uses. Reported 2026-08-03 against Safari
Technology Preview 249; fixed in 319365@main on 2026-08-18.

Playwright 1.62.1's WebKit was rolled 2026-07-21 (before the fix); 1.63.0
(WebKit "26.6", 2026-09-02) and 1.64.1 (WebKit "27.2", 2026-10-02) postdate
it. Suite `messenger-calls-webkit` runs all three builds against the same
published revision with the same throwaway pair: a constructor matrix (TURN
URLs with and without `?transport=`) and a real video call, recording the
sanitized ICE URLs LiveKit hands `RTCPeerConnection`. The attribution is
"solely 320931" only if the builds that reject the query fail to connect
and the builds that accept it connect.

## Physical-device test

Suite `messenger-calls-device` conducts the iPhone test. The designated test
account is signed in on the iPhone by its owner; CI never opens a browser
as that account. One throwaway partner (Chromium, synthetic camera and
microphone) posts each step into the shared chat. Push evidence is kept in
three tiers: dispatch (outbox `sent`, subscription `last_used_at`), delivery
(`last_receipt_at`, written only after the service worker displays the
banner) and accept (the iPhone's camera and microphone reach the partner).
Cleanup removes only Apple push subscriptions the test account created at or
after `device_since`.
