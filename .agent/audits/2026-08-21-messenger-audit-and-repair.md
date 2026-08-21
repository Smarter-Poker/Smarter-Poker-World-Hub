# Messenger audit and repair

Date: 2026-08-21
Follows: `2026-08-20-tournament-rake-and-messenger-delivery.md`

Brief: fix everything wrong with the club messenger, and check the whole
surface line by line for bugs, stubs, gaps, regressions and wiring issues.

The headline is that I had shipped the statements into the wrong messenger.
That is fixed, and four further live defects were found and fixed on the way —
two of which mean features that have **never once worked** in production.

---

## 0. There are three messengers, not one

| family | who reads it | rows | status |
|---|---|---|---|
| `social_conversations` / `social_messages` / `social_conversation_participants` | `/hub/messenger` + 18 `/api/messenger/*` routes | 91 messages | **the real one** |
| `messenger_*` (16 tables) | `useMessengerService` → `ClubArenaMessenger` at the poker table | 0 messages | separate in-game messenger |
| `conversations` / `messages` | Club Arena SPA's native tree | 2 messages | **entirely unrouted** |

The Club Arena "widget" is not a separate app: it is the collapsible identity
strip inside `/hub/messenger` (`messenger.js`, the club drawer). Switching to a
club re-runs the inbox with `context_entity_id` set to that club's `social_pages`
row, and `fn_get_user_conversations` filters
`p.context_entity_id IS NOT DISTINCT FROM p_context_entity_id`.

Club Arena's own `/messages` and `/clubs/:id/messages` are **iframes of
`/hub/messenger`**. Not one component in `src/components/messaging/` is imported
by any route — `MessagingService.ts` (1,445 lines), `MessageThread`,
`ConversationList`, `MessagesPanel` and about fifteen more are dead code.

## 1. My bug: the statements went to the dead family

`fn_union_send_club_message` wrote into `conversations` + `messages`. Nothing in
the live messenger reads those. The two statements I reported as delivered were
sitting where no screen could show them.

Rewritten onto the social family. Per (union, club) there is now one durable
thread — `is_group`, named `"<Union> Statements"`, `context_entity_id` = the
club's social page — so it appears in that club's inbox when you switch identity
in the widget. Messages carry `message_type = 'invoice'` with the full breakdown
in `media_metadata`.

Two constraints shaped the design and are worth recording:

- **`fn_get_or_create_conversation` refuses `p_user_id = p_other_user_id`.** On
  Midway the union owner and both club owners are the same account, so a DM
  literally cannot exist. Hence a one-sided group thread.
- **`social_conversation_participants` is UNIQUE on (conversation_id, user_id).**
  The first cut seated the union owner under the union page and then each club
  owner under the club page; for the same account that is 23505 and nothing was
  delivered at all. Recipients are seated first under the club identity, and the
  union owner only afterwards.

Verified: threads exist under both Club JAQK and SHARK CLUB, and
`fn_get_user_conversations(owner, <club page>)` returns
"Midway Union Statements" for each.

## 2. Reactions have never been saved. Not once.

`/api/messenger/react-message` takes a `social_messages` id and writes it into
`message_reactions`, whose foreign key was:

```
message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id)
```

`public.messages` — the *other* family. Every insert raised 23503, and the route
only `console.warn`'d before returning `{ success: true }`. The client rendered
the optimistic emoji and considered it stored. `message_reactions` held **0
rows**, which is the proof.

Three fixes:

1. FK repointed at `social_messages`.
2. Nothing ever read reactions back either — `get-messages` selected none, and
   the `get_message_reactions` RPC built for it had zero callers. New
   `fn_get_reactions_for_messages` returns a whole page in one query, and
   `get-messages` now includes them. `MessageBubble` adopts server state instead
   of holding optimistic-only.
3. `fn_toggle_message_reaction` was SECURITY INVOKER with no authorisation of
   its own, leaning on table grants that included `anon`. Now SECURITY DEFINER,
   checks the caller is acting as themselves and participates in the
   conversation, and `anon` loses its grants.

The route also no longer reports success on a failed write.

## 3. The 30-second inbox poll was reading the wrong messenger

`pages/hub/messenger.js` — the only background refresh for the entire sidebar:

```js
const { data: parts } = await supabase
    .from('messenger_participants')          // the IN-GAME messenger
    .select('conversation_id, last_read_at')
...
let msgQ = supabase.from('messenger_messages')
```

Every other path on that page reads `social_*`. Conversation ids from
`messenger_participants` can never match the sidebar built from
`social_conversations`, so the `.find()` at the bottom always returned
`undefined` and the poll returned every row unchanged. **It was a no-op costing
two queries per user every 30 seconds, forever.** A 2026-08-15 note in that same
block shows it was patched once for a 42703 without anyone noticing the table
family itself was wrong.

It now calls `fn_get_user_conversations` — the exact RPC behind
`/api/messenger/get-conversations` — so it is one query instead of two and can
never disagree with the list it updates. It also takes the active identity as a
dependency, so switching club in the widget re-scopes the poll.

## 4. The Club Arena drawer could say "Loading your clubs..." forever

The drawer rendered that string on `!hasClubPage` with no settled flag, and both
fetch paths in `ActiveIdentityContext` swallow failures into `console.warn`. A
user who owns no club page, or whose lookup failed, sat on "Loading" permanently.

Added `identityLoaded` to the context, set in a `finally` so it settles on
success and failure alike. The drawer now distinguishes loading from "you have
no club inboxes yet".

## 5. Club Arena page fixes

- **`MessagesPage` queried `club_members` with the raw route param.** That param
  can be a club code or slug; `ClubMessagesPage` already resolved it first. On a
  slug route the uuid comparison matched nothing, the role stayed `member`, and
  an owner silently lost their admin tabs. Now resolved.
- **`MessagesPage`'s 12-second load timeout read a stale `iframeLoaded`** captured
  when the effect ran (always false), so a messenger that loaded in two seconds
  could still be declared broken at twelve. Now a ref.
- **`ClubMessagesPage` had no error state at all**, despite its header claiming
  parity with `MessagesPage`. A failed iframe left the skeleton shimmering with
  no way out. Added the same 12s guard, error fallback and retry.

## 6. The statement renders as a card

`ClubStatementCard` in `MessageBubble`: period, the amount due or owed with its
direction colour, the due date, and a collapsible breakdown of rake generated,
rakeback, union fee, player win/loss, settled in chips and the ECO adjustment.
Anything that does not know `message_type = 'invoice'` still shows the readable
text body, which is why both are sent.

## 7. Verification

- Club Arena `tsc --noEmit`: clean, exit 0, zero errors repo-wide.
- All five changed Hub files parse under esbuild.
- Statement threads confirmed present in both club inboxes via
  `fn_get_user_conversations`.
- Reaction FK confirmed repointed by a post-apply assertion inside the migration.

## 8. Known and deliberately not done

These are real, documented, and out of scope for one pass:

1. **`messenger_blocked` is enforced but never written.** `send-message` and
   `start-conversation` check it, but only the in-game messenger writes it. A
   user blocked from `/hub/messenger` is not actually recorded anywhere.
2. **Scheduled messages and reminders have no dispatcher.** `messenger_scheduled`
   and `messenger_reminders` are write-only; no cron ever sends them.
3. **Club Arena's dead messaging tree** — roughly twenty components and a
   1,445-line service, unreachable, carrying references to columns that do not
   exist (`messages.is_seen`, `messages.image_url`, `conversations.last_message`,
   `social_conversation_participants.role`). It should be deleted, but deleting
   ~6,000 lines belongs in its own change with its own verification.
4. **`SmarterPokerMessenger.jsx` is a 3,595-line dead fork** of
   `ClubArenaMessenger.jsx`, differing by ~466 lines. One consumer, none.
5. **Two orphan API routes** — `messenger/global-search`, `messenger/broadcast-message` —
   fully implemented, zero callers.
6. **The club badge and the inbox count come from different RPCs** on different
   refresh schedules, so they can disagree. The poll fix above removes one of
   the three sources; unifying the remaining two is a follow-up.
