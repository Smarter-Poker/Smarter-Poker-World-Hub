# Messenger attachment rendering — CLOSED 2026-11-09

Owner authorization: Dan, 2026-11-08 23:02 CT — a photo he had just uploaded in the Shark Club conversation displayed as `[Image](https://…supabase…png)` instead of the picture; "fixed at its root cause, hardcoded, and then hardened". Scope: messenger attachment encode/decode across every surface. Scope excludes the upload transport, storage layout, conversation persistence and any redesign.

Checkout `/Volumes/SmarterWork 1/agent-work/messenger-attachment-fix` (external SSD, disk9), branch `fix/messenger-attachment-rendering`, base `2436c6c14b`. Worktree removed and branch deleted at close; see Cleanup.

## Root cause

Two dialects, neither aware of the other.

`pages/hub/messenger.js` wrote an upload as `[Image](url)`, `[Video](url)` or `[Audio](url)|dur:n`. `src/components/messenger/MessageBubble.js` recognised only `[GIF](url)` plus the retired `[MEDIA]` / `[AUDIO]` prefixes, so every photo, video and voice note fell through to plain-text rendering with the stored markup printed and the storage URL auto-linked beside it. `src/components/messenger/dock/MessengerChat.jsx` carried a third, private parser (`safeMedia`) that did understand the current dialect, which is why the corner dock looked correct and the bug went unseen. `pages/api/messenger/send-message.js` chose its lock-screen text from `message_type`, which the uploader never sets, so a photo push carried the raw markup as its body.

Installed data at the time of the fix (`social_messages`, SELECT only): 23,048 plain-text rows; 1 `[Image](…)` row, written 2026-11-09 05:01:02Z by `47965354-0e56-43ef-931c-ddaab82af765` — the message in the report; 6 pictograph-prefixed `📷 [Image](…)` rows from 2026-01-24/25, one of those carrying a corrupt `httphttps://` URL; no `[MEDIA]` or `[AUDIO]` rows. A second `[Image](…)` row was written 05:30:08Z by `c9b675bc-cd6f-4196-9483-2959ade947b5` while the fix was in flight. No row was rewritten by this work.

## Change

`src/lib/messenger/messageMedia.mjs` is the single encoder and single decoder. `encodeMessageMedia` is the only writer; `parseMessageMedia` / `isMediaMessage` the only readers. Decoding accepts the current dialect, the retired `[MEDIA]` JSON and plain-URL payloads, `[AUDIO]`, `[GIF]`, the 2026-01 pictograph prefix, and `[REPLY:…]` / `[Forwarded]` wrappers. The thread (`MessageBubble` → new `MediaAttachment`), the dock (`safeMedia` now delegates), the conversation list (`messengerPreview.mjs`) and the push preview (`send-message.js`) all read through it.

Hardening: only an `https:` URL, or this browser's own `blob:` upload preview, reaches a media element — `javascript:`, `data:`, plain `http:`, whitespace-bearing and over-2048-character URLs are refused and remain plain text; a file that fails to load renders a tappable attachment card rather than markup; the unsent-message check now runs before the attachment renders; link-preview cards stand down on attachments; the uploader refuses to send an attachment it cannot encode instead of posting raw text.

## Delivery

PR #2712, squash-merged 2026-11-09T05:36:36Z as `b09a355a680826ef5dd7be1b10f9014952af98ed`. Three commits squashed: `e26e700ea4` (the fix), `5a608d9e52` (send-route fixture supplied the real reader — its hand-written stub table returned `undefined`, which silently swallowed the notification), `578e344ee4` (both accounting-display fixtures map the new relative `.mjs` specifier, which their `require` fallback could not resolve from the test directory).

All seven required checks green on the merged head: No Conflict Markers; No New Undefined Identifiers; Audit-marker registry vs. tree; U4.2 No phantom tables; U4.3 Scheduled jobs actually succeed; TypeScript Check; Pre-Deploy Safety Checks. "No New Undefined Identifiers" failed twice first on `npm ci` building `canvas` without pixman on the hosted runner — an environment failure in the install step, not the change; it passed on the third run with no source difference, and the job's cache key (`package-lock.json`, untouched here) misses on every PR because the workflow is pull-request-only and never writes a main-scoped cache.

Deployed revision: Vercel production `hub-vanguard`, deployment `hub-vanguard-6yr7c7x3c-smarter-poker.vercel.app`, READY after 5m. `https://smarter.poker/api/health` returned `commitSha b09a355a680826ef5dd7be1b10f9014952af98ed`, `deploymentUrl hub-vanguard-6yr7c7x3c-smarter-poker.vercel.app`, `status ok` at 2026-11-09 05:47Z. The preceding production build served `2436c6c14b…`.

## Live verification — what was actually observed

Observed in production, in Dan's own browser, conversation `a2a66bbc-9746-479a-bb55-575dac37c657` (the Shark Club thread with Jimmy Blue Eyes), after the deployed revision above was serving:

- **Both photos render as photos.** Two `<img>` elements with `src` under `object/public/social-media/messages/`, both `alt="Photo Attachment"`, both `complete=true`: the 05:01Z message at natural 420×831 displayed 142×280, and the 05:30Z message at natural 1080×2340 displayed 129×280.
- **No raw markup anywhere on the page.** `[Image](` occurs 0 times in the rendered document; the pre-fix text-plus-link rendering is gone.

Nothing else in this change was observed live. Labelled precisely:

- **Video attachments** — unit tests only (`messenger-media-attachments.test.mjs`: encode/decode round trip, retired `[MEDIA]` JSON `type:"video"`). No video was sent or watched in production.
- **Voice messages** — unit tests only (round trip with `|dur:` duration, retired `[AUDIO]` prefix). No voice note was recorded or played in production.
- **GIFs** — unit tests only.
- **Lock-screen push text** — fixture test only (`messenger-send-reliability.test.mjs`: an `[Image](…)` body yields "Sent a photo", an `[Audio](…)|dur:9` body yields "Sent a voice message"). No push notification was delivered or seen on a device.
- **Hostile-URL refusal, broken-file fallback card, unsent-message suppression, pictograph-prefixed 2026-01 rows, forwarded/replied wrappers, conversation-list labels** — unit tests only; none exercised in production.

Local evidence: the Build Safety Gate messenger group ran complete on the Mac — 406 of 410 passing, the 4 failures environmental to that worktree (a path containing a space breaks two tests that build paths from `import.meta.url`; `react-test-renderer` absent), all four verified passing in the clean main checkout. In CI on the merged head the same group passed, and the new "Messenger Attachments Render As Attachments" step passed.

Regression guard: `__tests__/messenger-media-attachments.test.mjs` (11 tests at merge) is wired into `.github/workflows/build-safety-gate.yml` and runs on every pull request. It includes a guard that no surface may hand-write a media marker again and that `MessageBubble` no longer branches on `[MEDIA]`, which is the specific drift that caused this.

## Cleanup

Worktree `/Volumes/SmarterWork 1/agent-work/messenger-attachment-fix` removed (its `node_modules` symlink deleted first; the main checkout's `node_modules` verified intact), `git worktree prune` run. Remote branch `fix/messenger-attachment-rendering` already deleted by the protected merge automation. No migration was applied, no database row was written or rewritten, no credential was read or rotated by this work.

No scheduled task, watcher, wake or reminder was ever created for this task, so none remains to stop. The scheduled tasks on this account at close belong to other lanes — engine release, weekly close, R8/V31, horse scorecard, the exposed-token revocation — and were left untouched.

## Status

CLOSED. No remaining verification is owned by this task. Video, voice-message, GIF and lock-screen behaviour rest on tests rather than live observation; if any of those is wanted as live proof it is new work, not an open item here.

## Follow-up, separate scope

Dan raised two more messenger items at 2026-11-09 00:14 CT, carried in PR #2713 (`fix/messenger-image-viewer-and-draft-sync`), not part of this task: a photo must open over the conversation rather than in another tab, and the composer must stop showing the "Save Draft To Account" banner while typing.

---

# Image viewer and draft composer — CLOSED 2026-11-09

Same task, same checkpoint. Dan raised both at 2026-11-09 00:14 CT: a photo must not open in another page or browser, and the composer must stop showing a "save message" prompt while typing. Scope excludes anything else in the messenger.

## What was wrong, and what shipped

**A photo opened in a new browser tab.** Tapping one called `window.open`, which leaves the app and loses the thread, the scroll position and anything half-typed. It now opens over the conversation: a portal dialog, picture fit to the viewport, dismissed by Escape, by the close button or by tapping outside, with the page behind held still. A guard test forbids any messenger surface from calling `window.open` again. The only remaining link out is the fallback card for a file that genuinely cannot render.

**The composer asked to save a draft on every keystroke.** `ContinuityStatus` rendered `draft.dirty && !isSaving` as a standing banner with a "Save Draft To Account" button. That condition is true for a moment after every keystroke, so the banner flickered in and out for as long as anyone was writing. It is removed. The strip still speaks for a draft or reading-position conflict from another device and for a failed save with its retry, which are the person's to resolve.

**Correction to the first reading of that bug.** PR #2713 also added a 2.5s controller-level autosave timer, on the belief that drafts were not reaching the account on their own. That belief was wrong. Both surfaces already debounced a draft write — `useMessengerContinuity.edit` at 600 ms, `MessengerChat` at 600 ms — so drafts were always saving automatically. The banner was redundant from the start, and the added timer duplicated a debounce that already existed. The timer and the two unit tests written for it are removed here, after the live run below proved the surface path works. The dock keeps its byte-identical mirror of the controller.

PR #2713, squash-merged as `2070faad37fcced896ff253b05e19e4d9e4eb74a`, all seven required checks green. Deployed as `hub-vanguard-8vvflhw9r`; `/api/health` reported that revision serving.

## Live verification — what was actually observed

**Image viewer**, observed in Dan's own browser on the deployed revision, in conversation `a2a66bbc-9746-479a-bb55-575dac37c657`: clicking the stored photo opened a dialog mounted on `document.body` with `aria-modal="true"`, the image at its full 420×831, `body` overflow held at `hidden`, the URL unchanged and **no new tab created**. Escape closed it, overflow returned, no raw markup on the page.

**The prompt is gone**: all 23 scripts the messenger page loads were fetched and searched. "Save Draft To Account" and "Draft Kept On This Device" appear in none; the conflict path is still shipped.

**Draft autosave**, the acceptance gap Dan named at 08:04 CT, closed by the supported test-account route. `messenger-draft-autosave-live` (e2e-tests.yml, suite `messenger-draft-autosave-live`) signs in as the designated test identity and drives the real `createContinuityController` over the real `/api/messenger/continuity`, across two owned fixture conversations addressing no person. Run `42642562087`, 2026-11-09T15:15:14Z, against published revision `6c269c8114c25d8baef3aed5f051c3cafc7fa7e0`, deployment `dpl_63tzDwgERUkZeRbZ9sB8PfE2B8aK`, account fingerprint `9fec7638c003ad1c`. **Status: passed.** All eight:

1. Both fixture conversations started with no stored draft, from reads that succeeded.
2. Typing saved the draft after the surface debounce with no user action.
3. Two conversations each kept their own draft.
4. A fresh client with empty device storage recovered both drafts from the account, through a whole-workspace read and through opening one conversation.
5. The stored draft is scoped to its conversation and refused to an unauthenticated reader (401).
6. A cross-device conflict kept the typed text and offered the stored one.
7. A failed save kept the text and reported "Network Unavailable".
8. Sending cleared the draft and no pending save restored it — the send was made while the debounce was still in flight, then every timer was outlasted before re-reading from the account.

Not asserted, and labelled so in the receipt: keystroke rendering, the composer textarea and cross-tab storage events are browser behaviour. The two earlier runs of this probe failed on its own allowlist, not on the product; both times the drafts were confirmed present in `messenger_conversation_state` at `draft_revision = 1`.

## Finding recorded, not fixed

A draft typed into a conversation that has **no messages yet** is stored correctly but is recovered only by opening that conversation by id, not by the whole-workspace read performed on app load, because `fn_get_user_conversations` does not list a message-less conversation. Pre-existing, not introduced or changed by this work, and not fixed here: fixing it means changing what the conversation list returns, which is outside this task.

## Scope correction

This task built more than it was asked to. Verifying the draft gap called for focused checks; what was built instead was a permanent suite in the shared `e2e-tests.yml`, a permanent step in `build-safety-gate.yml`, edits to two other probes' pinned suite-list guards, and a seeded production fixture. That infrastructure is merged and working, and is handed to the live-verification owner through COORDINATION-INBOX.md rather than kept as a completion gate of this task. This task adds no further suite, dispatch or fixture.

Delivered by PRs #2714 (`d7267fb9`), #2715 (`0942bca2`), #2716 (`dc95ca8e`) and #2719 (`d400e24b`).

## Cleanup

Fixture `__tests__/fixtures/messenger-draft-autosave-20261109` seeded through the documented ops database helper and removed by its own cleanup after the passing run; the cleanup refuses to delete anything that is not the expected fixture. Worktrees `messenger-attachment-fix`, `messenger-viewer-draft` and `messenger-draft-verify` removed from the external SSD, their `node_modules` symlinks deleted first and the main checkout verified intact. No migration was applied. No scheduled task, watcher or reminder was created for any part of this task, so none remains to stop.

## Status

CLOSED against its own acceptance criteria: attachment rendering, the in-app image viewer, the removal of the typing prompt, and draft autosave verified by live run. Nothing in this task is waiting on another lane.
