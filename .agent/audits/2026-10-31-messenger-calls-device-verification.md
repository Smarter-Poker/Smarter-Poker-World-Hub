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

Suite `messenger-calls-device` conducts the device test, one device per run
(`device_kind` iphone or ipad, each with its own receipt). Since 2026-11-01
the person signs in on the device to an ordinary account they created for
the test (`device_user_email`; role user or player, created in the last 30
days); the conductor resolves only its id, never signs in as it, and refuses
elevated accounts, including the god-mode service identity, because nothing
in this test needs more than a member's permissions. CI never opens a
browser as that account. A visible banner is recorded only from the
person's own BANNER YES / BANNER NO reply; server acceptance, the worker
receipt and joining the room are each reported separately and none of them
counts as a banner. One throwaway partner (Chromium, synthetic camera and
microphone) posts each step into the shared chat. Push evidence is kept in
three tiers: dispatch (outbox `sent`, subscription `last_used_at`), delivery
(`last_receipt_at`, written by the service worker after it handles the
push) and accept (the iPhone's camera and microphone reach the partner).
Cleanup removes only Apple push subscriptions the device account created at or
after `device_since`.

### Result: run 41239977778 (revision c09a45d8, 2026-10-31)

| Playwright | WebKit | `?transport=` TURN URL | LiveKit's TURN URLs via setConfiguration | Call |
|---|---|---|---|---|
| 1.62.1 | 26.5 (r2336) | rejected: `SyntaxError: Invalid TURN URL query string` | rejected in all 6 regions tried | never joined |
| 1.63.0 | 26.6 | accepted | accepted | connected; received 1280x720 video and audio |
| 1.64.1 | 27.2 | accepted | accepted | connected; received 1280x720 video and audio |

LiveKit Cloud returns `turn:...:3478?transport=udp` and
`turns:...:443?transport=tcp`, so every join on the 26.5 build fails at
`setConfiguration`. The app revision, accounts and LiveKit project were the
same for all three builds. Conclusion: the BLOCKED case in run 41236048552 is
solely WebKit bug 320931 in the test harness's WebKit; no product change.
Playwright's WebKit is a trunk build, not a shipped Safari. The bug was
reported against Safari Technology Preview 249. A physical iPhone is the
evidence for shipped iOS Safari.

Limits: Playwright WebKit on Linux cannot grant a camera or microphone
(`NotAllowedError`), so these WebKit calls are receive-only. Sending from
Safari is left to the physical-device test. Run 41239487494 (the first
attempt) has the same connect/fail split but did not capture LiveKit's URLs,
because they arrive through `setConfiguration`; the recorder was fixed before
41239977778.
