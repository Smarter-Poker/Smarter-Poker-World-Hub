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

## 7. Club Arena's dead tree is gone too

Done in a separate Club Arena commit (`b526323ac`) rather than here, because
it is a different repo. 39 files removed:

- all of `src/components/messaging/` — 16 components plus their stylesheets,
  none imported by any route
- `components/navigation/ClubArenaBottomNav.tsx` — linked to `/club/:id/...`
  routes that do not exist; every real route is `/clubs/`
- `components/social/ConversationList.tsx` — called `fn_get_conversations`,
  an RPC that reads `direct_messages` while every write goes to `messages`
- `components/social/PrivateChat.tsx` and its barrel exports
- `hooks/useMessageDraft.ts` — only consumer was `MessageThread`
- `pages/NewConversationPage.tsx` — a redirect stub shipped as its own lazy
  chunk; `/messages/new` now points straight at `MessagesPage`

This mattered beyond tidiness. That tree is where the schema bugs lived: it
read `messages.is_seen`, `messages.image_url`, `conversations.last_message`,
`conversations.participant1_id` and `social_conversation_participants.role`,
none of which exist, and mixed three different conversation schemas inside
single code paths. Left in place it was an invitation to "fix" it and wire a
broken implementation back up.

`MessagingService.ts` and `ClubMessagingPermissions.ts` deliberately stay, for
the reason in section 5.

Verified before pushing: `tsc --noEmit` clean, `vite build` clean, ClubDataPage
chunk still emitted, and zero overlap with the 100 files another session had
open in that repo.

## 8. Still not done, and why

1. **`pages/api/messenger/broadcast-message.js`** still has no caller. Left in
   place — it is a working fan-out tool, not a defect.
2. **The in-game table messenger** (`messenger_*`, `ClubArenaMessenger`) is
   mounted on the poker table but holds 0 messages. Scheduling now delivers
   into it, but nothing has ever been sent through it.
3. **`MessagingService.ts` still carries ~1,200 lines of dead DB methods**
   behind its three live helpers. Extracting the helpers into a small module
   would let the rest go; that is a focused follow-up, not a side effect of
   this pass.

## 8b. The statement thread was delivered but not visible

Reported as still not working. It was: the thread existed, the API returned it,
and the client then hid it four different ways. All four are the same root
cause — **a group conversation has no "other user"**, and the messenger assumed
every conversation has one. `fn_get_user_conversations` returns the statement
thread as `title: "Midway Union Statements", is_group: true,
other_user_id: null`.

1. **The fallback path deleted it.** `loadConversations`' direct-Supabase
   fallback ended with `.filter(c => c.otherUser)`, which discards every group
   by definition. On any request that fell through to that path — circuit
   breaker open, API error, stale schema cache — the statements were fetched
   and then thrown away before render.
2. **The sidebar row showed "Unknown".** `ConversationItem` derived its name
   purely from `otherUser` and never looked at `title`, so a group rendered
   nameless with a blank avatar.
3. **The open thread had no name either.** The chat header and empty state both
   read `otherUser?.full_name || ...`, which is undefined for a group.
4. **Search hid it.** The sidebar filter matched only the other person's name,
   so typing anything made the thread vanish.

Fixed by giving both surfaces a title fallback (`title` from the API path,
`group_name` from the fallback path), keeping groups in the filter, and adding
the title to the search match. The Block action is correctly suppressed on
group threads, since there is no single person to block.

Also fixed while in there: **the client-side fallback ignored the club identity
filter entirely** — it selected participations by `user_id` alone, so in club
mode it would render private personal DMs underneath the "MESSAGING AS: CLUB"
header. The API route's own fallback carries a long comment about fixing
exactly this; the client copy never got it.

Confirmed against live data: the message carries `message_type: 'invoice'` with
`metadata.kind: 'union_invoice'` and a full `lines` object, so it renders as the
statement card rather than raw text.

## 9. Verification

- Every changed Hub file parses under esbuild.
- Club Arena: `tsc --noEmit` exit 0 with zero errors, `vite build` exit 0.
- Migration assertions passed on apply: the badge/inbox equality check, and the
  dispatcher running clean on an empty queue.
- `message_reactions` FK, statement threads and ECO settings re-checked and
  still correct after this pass.
- Open Claw redeployed: 93 jobs, 0 errors, and the new
  `/api/messenger/dispatch-scheduled [*/5]` job confirmed registered on the
  box.
- Production served `8234037b` (this pass's Hub commit) before the Club Arena
  deletion was pushed.
