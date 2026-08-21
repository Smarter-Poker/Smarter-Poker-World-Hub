# Messenger audit, pass 2

Date: 2026-08-21
Follows: `2026-08-21-messenger-audit-and-repair.md`

Second pass over the messenger. Pass 1 fixed delivery, reactions, the inbox
poll and the club drawer. This pass closes three of the items pass 1 recorded
as "known and deliberately not done", adds one enhancement, and corrects one
claim I made in pass 1.

---

## 1. Blocking now exists

Pass 1 recorded that `messenger_blocked` was enforced but never written. That
was right, and worse than it sounded: `/hub/messenger` has **no block control
anywhere** — grep for it returns only unrelated matches like `display: block`.
The only writer in the entire codebase is `useMessengerService`, which belongs
to the in-game table messenger mounted on the poker table. So the table was
empty platform-wide, and both `send-message` and `start-conversation` were
carefully enforcing a list nobody could add to.

Added:

- `pages/api/messenger/block-user.js` — `block` / `unblock` / `list`, JWT
  identity only. `blocker_id` is always the caller, so nobody can create or
  remove a block on someone else's behalf.
- A Block / Unblock entry in the conversation context menu, offered only on
  direct threads (a group has no single other party).
- The block list loads once per session and the toggle is optimistic with a
  revert on failure.

`anon` also held `arwdxtm` on `messenger_blocked` — write grants on the table
that decides who may talk to whom. Revoked.

## 2. The badge and the inbox now count the same thing

Pass 1 said these two disagreed on *refresh schedule*. Looking properly, they
disagreed on **definition**, which is worse:

| | scope | read tracking |
|---|---|---|
| `fn_get_user_conversations` (inbox) | participant's `context_entity_id` | rows in `social_message_reads` |
| `fn_get_all_identity_unread_counts` (badge) | **conversation's** `context_entity_id` | `created_at > last_read_at` |

`fn_mark_messages_read` maintains both read mechanisms together, so the read
half usually landed in the same place. The scope half did not. Switching
identity filters the inbox on the **participant** row, because that is what
records which identity you are reading as. Grouping the badge by the
conversation's context meant a thread whose context was set by the other party
counted toward a badge for an identity you never act as, and a thread where
only your own participant row carries the context was missed entirely.

The badge RPC now uses the inbox's scope and the inbox's read tracking, with a
post-apply assertion that the two agree for a real club identity. And
`refreshUnreadCounts` on the identity context is called from the messenger's
30-second poll, so the badge can no longer sit minutes behind the club rows it
is summarising.

## 3. Scheduled messages actually send

`scheduleMessage` writes a `messenger_scheduled` row with status `pending`, the
UI lists it, `cancelScheduledMessage` withdraws it — and nothing ever delivered
one. Not `pages/api/cron` (28 handlers), not `vercel.json`, not Open Claw, not
pg_cron, not any Postgres function. Write-only. A user who scheduled a message
got a confirmation and then silence.

`fn_messenger_dispatch_scheduled` is the missing half:

- only due, still-`pending` rows
- `FOR UPDATE SKIP LOCKED`, so overlapping runs cannot double-send
- a sender who has left the conversation marks the row `failed`, not retried
  forever
- one bad row cannot stop the batch; the run is capped

Driven by `/api/messenger/dispatch-scheduled` every five minutes from Open
Claw. Outside `pages/api/cron/` because section 11.3 blocks net-new files
there and forbids pg_cron for application logic — which sending a user's queued
message is.

## 4. Enhancement: search actually searches messages

The sidebar search only ever filtered conversations by the **other person's
name**. There was no way to find a message by what it said.

`/api/messenger/global-search` does exactly that — authenticated, LIKE-escaped,
rate limited, capped at 30 results — and had zero callers since the day it was
written. It now has one. Typing two or more characters shows a **Messages**
section under the conversation list with the sender, a snippet and the date;
clicking a result opens that thread. Debounced at 300ms.

## 5. A correction to pass 1

Pass 1 listed Club Arena's `MessagingService.ts` as part of a wholly dead tree
that should be deleted. That is not accurate. Three of its methods have live
callers outside the messaging tree:

- `generateProfileQRData` — `src/pages/PublicProfilePage.tsx`
- `getNotificationPreferences` / `setNotificationPreferences` —
  `src/components/social/NotificationSettingsPanel.tsx`
- `isNotificationTypeMuted` — `src/services/NotificationService.ts`

All three are string/localStorage helpers that touch no table, so there is no
hidden "writes to the dead family" bug behind them — but the file cannot simply
be deleted, and I should not have implied it could.

## 6. Dead code removed

World Hub only, verified zero importers first:

- `src/components/social/SmarterPokerMessenger.jsx` (204 KB) — the dead fork of
  `ClubArenaMessenger.jsx`. `messengerPrefsSync.js` documents a previous drift
  incident between these two copies; this removes the possibility of another.
  Its only reference was a barrel re-export that nothing imported.
- `services/MessagingService.js` (22 KB) — zero importers anywhere.
- `src/content-engine/pipeline/HorseMessengerEngine.js` (9 KB) — zero
  references anywhere.
- The corresponding export block in `src/components/social/index.js`.

`pages/api/debug/check-messages.js` and `test-messaging.js` were already
neutered to 410 by someone else — pass 1 listed them as shipped debug routes,
which was wrong.

## 7. Still not done, and why

1. **Club Arena's unrouted messaging tree** (~20 components) is still there.
   That repo currently has 97 modified files from another session; deleting
   6,000 lines underneath an agent mid-edit would collide. It needs its own
   change on a clean tree, and `MessagingService.ts` needs its live helpers
   extracted first (see section 5).
2. **`pages/api/messenger/broadcast-message.js`** still has no caller. Left in
   place — it is a working fan-out tool, not a defect.
3. **The in-game table messenger** (`messenger_*`, `ClubArenaMessenger`) is
   mounted on the poker table but holds 0 messages. It works now that
   scheduling delivers, but nothing has ever been sent through it.

## 8. Verification

- Every changed Hub file parses under esbuild.
- Migration assertions passed on apply: the badge/inbox equality check, and the
  dispatcher running clean on an empty queue.
- `message_reactions` FK, statement threads and ECO settings re-checked and
  still correct after this pass.
