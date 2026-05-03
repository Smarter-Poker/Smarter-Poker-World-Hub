# Conversation Schema Pivot — messenger_* is the new canonical

**Captured:** 2026-05-01  
**Author:** Cowork agent (after a wrong call I had to back out)  
**Severity:** Architecturally important — affects every future messenger change

## TL;DR for future agents

The smarter.poker database has THREE conversation table sets in
production simultaneously. They are NOT redundant — they are the
historical layers of an ongoing migration:

| Table set | Status | Last write | Notes |
|---|---|---|---|
| `social_conversations` + `social_conversation_participants` + `social_messages` | DEPRECATED | 2026-04-20 (`social_messages` last insert) | Old messenger schema. Still has 8 conversations / 73 messages from before the pivot. Read-only effectively. |
| `messenger_conversations` + `messenger_participants` + `messenger_messages` | NEW CANONICAL | being actively built today | The parallel Antigravity session has been rebuilding messenger on this schema. 130 participant rows, 0 conversations (FK quirk — see below). |
| `conversations` | LEGACY UNDERLYING | 1 row | Originally the FK target of `messenger_participants`. May be a transitional table or RLS scope holder. Don't write to it directly. |

`messenger_participants.conversation_id` FKs to `public.conversations`,
not `public.messenger_conversations`. This looks broken at first
glance but is intentional during the migration — `conversations`
holds the canonical conversation rows while `messenger_conversations`
is being populated. Eventually `messenger_conversations` will replace
`conversations`.

**Do not "clean up" any of these tables.** Each is in active use or
has historical data that hasn't been migrated yet.

## Why this exists as a doc

I (Cowork agent, 2026-05-01 ~16:00 UTC) misread the situation. The
Phase 29 overload-ambiguity sweep flagged `fn_get_or_create_conversation`
as having two overloads:

- `(user1_id, user2_id) → uuid`   — wrote to `messenger_conversations`
- `(p_user_id, p_other_user_id, p_conversation_type) → jsonb` — wrote to `social_conversations`

I assumed the jsonb-returning one was canonical (because it was
called by more API routes) and the uuid one was orphaned legacy. So
I dropped the uuid overload via migration
`20260501_drop_legacy_get_or_create_conversation.sql`.

Within minutes the function reappeared. The parallel session's
migrations from earlier today
(`20260501104942_fix_messenger_rpc.sql` +
 `20260501110219_fix_messenger_rpc_schema_typo.sql`) both
`CREATE OR REPLACE` the uuid overload pointing at `messenger_*`,
and their CI re-applies migration files on every push. So the
function came back, my drop oscillated, and I'd actually broken
the parallel session's in-flight messenger rebuild.

The fix:

1. **Deleted the drop migration file** `20260501_drop_legacy_get_or_create_conversation.sql`
   so it doesn't oscillate. The schema_migrations row stays as
   audit trail.
2. **Reverted `services/MessagingService.js`** back to using the
   `(user1_id, user2_id)` signature so it hits `messenger_*`.
3. **Restored both overloads in `src/types/supabase.ts`** as a
   union type, with comments explaining each.
4. **Wrote this doc** so the next agent doesn't re-fight the
   battle.

## Rules going forward

- New messenger code SHOULD target `messenger_conversations` /
  `messenger_participants` / `messenger_messages`.
- Existing `social_*` callers (pages/api/messenger/start-conversation.js,
  club-arena cashout flows) should NOT be migrated unilaterally —
  the parallel session owns the messenger rebuild and will move them
  on their schedule.
- DO NOT drop `fn_get_or_create_conversation(uuid, uuid)` —
  it's the new canonical messenger entry point.
- If you find another "duplicate overload" pattern, **check both call
  sites' table targets** before assuming one is legacy. Different
  table targets mean different functions that just happen to share a
  name during a pivot.
- The "Phase 29 sweep" applied to ACTUAL ambiguity bombs (functions
  whose multiple overloads target the same table). The conversation
  function is NOT one of those — it's two functions wearing the same
  name during a transition.

## Ongoing risk

While both overloads exist, PostgREST overload resolution still has
to disambiguate `{p_user_id, p_other_user_id}` vs `{user1_id, user2_id}`.
The argument names are different, so disambiguation is by
parameter name, not arity — this is unambiguous from PostgREST's
perspective. Lower risk than the daily-login `add_diamonds_to_balance`
case where both overloads accepted the same named args.

## TWO bugs in the (user1_id, user2_id) → uuid overload (added 2026-05-01)

Live-tested the function via direct SQL call:
```
SELECT fn_get_or_create_conversation(user1_id := <real_uuid>, user2_id := <real_uuid>);
```

Both bugs surface back-to-back:

1. **Role CHECK violation.** The function inserts
   `INSERT INTO messenger_participants (conversation_id, user_id, role)
   VALUES (..., 'owner'), (..., 'owner');` but the table has
   `messenger_participants_role_check = (role IN ('admin','member'))`
   — `'owner'` is rejected. The 130 existing rows split admin=70 /
   member=60, so the convention is initiator=admin, recipient=member.

2. **Foreign-key violation.** Even if role were valid,
   `messenger_participants.conversation_id` foreign-keys to
   `public.conversations`, NOT `public.messenger_conversations`.
   The function inserts a row into `messenger_conversations` and
   uses that ID, which doesn't exist in `conversations` → FK violation
   on participants insert.

The function has been broken since it shipped at 2026-05-01 11:02 UTC.
It works zero times. The 130 messenger_participants rows must have
been created by another code path (direct INSERTs that target
`conversations` directly), not via this RPC.

**Why it's not currently a P0 production issue:** the only caller in
the codebase is `services/MessagingService.js`, which is dead code
(no imports anywhere in any local repo, verified by grep). So nobody
hits it.

**When it becomes a P0:** the moment somebody starts importing
`MessagingService.getOrCreateConversation()`, every messenger DM
attempt 500s.

**Fix when the parallel session is ready:** two-part Tier 3 migration.
(a) Change `INSERT INTO messenger_conversations` → `INSERT INTO
public.conversations` OR retarget the FK to messenger_conversations
(deciding which one is the canonical conversation row table is a
parallel-session call). (b) Change `'owner', 'owner'` → `'admin',
'member'`. I'm not shipping this from this session because the FK
choice is architectural and I don't have enough context on which of
{conversations, messenger_conversations} is intended to be canonical
post-pivot.

## When the pivot completes

Once `messenger_*` has fully replaced `social_conversations` (i.e.
all callers in `pages/api/messenger/`, `pages/hub/messenger.js`,
`pages/api/club-arena/*-cashout.js`, etc. have been moved), the
jsonb overload can be dropped. Don't do it before that.

## CORRECTION (2026-05-03) — there's no pivot, just feature carve-out

After re-investigating during Phase 40 wrap-up, the original audit's
"pivot in progress" framing was wrong. Actual reality:

- **`social_*` schema** = direct (1-to-1) DMs between users — live, used
  by `fn_get_or_create_conversation` (jsonb overload), `fn_send_message`,
  `fn_get_user_conversations`, `fn_mark_messages_read`. Last write
  2026-05-01 17:53.
- **`messenger_*` schema + `conversations` table** = group chats (live
  poker table chat via `LivePokerTable.jsx` + `ClubArenaMessenger.jsx`,
  commander home group chats via `fn_create_home_group_conversation`
  trigger). 130 active participant rows. Properly RLS-locked with
  `auth.uid()` checks. NOT abandoned.
- **The (user1_id, user2_id) → uuid overload was a stillborn refactor
  attempt** that tried to pivot direct DMs onto the group-chat schema.
  It's dead code — only reference is `services/MessagingService.js`
  which is unimported. **Dropped 2026-05-03 in
  `phase40_drop_dead_uuid_overload`.** Verified via pg_proc post-drop:
  exactly 1 surviving overload (the jsonb 3-arg, the live one).

So the 3-table-set thing isn't a half-finished migration — it's two
distinct messaging features (DMs + group chat) that share a vocabulary.

| Function | Tables referenced | Purpose | Status |
|---|---|---|---|
| `fn_get_or_create_conversation` jsonb overload | `social_*` | Direct DMs | LIVE (kept) |
| `fn_get_or_create_conversation` uuid overload | `messenger_*` | (was: pivot direct DMs to messenger schema) | **DROPPED 2026-05-03** |
| `fn_get_user_conversations` | `social_*` | List user's DMs | LIVE (kept) |
| `fn_send_message` | `social_*` | Send a DM | LIVE (kept) |
| `fn_mark_messages_read` | `social_*` | Mark DM read | LIVE (kept) |
| `fn_create_home_group_conversation` (trigger) | `conversations` + `messenger_participants` | Auto-create group chat for home group | LIVE (kept) |
| `fn_add_member_to_group_conversation` (trigger) | `messenger_participants` | Track group joins | LIVE (kept) |
| `fn_remove_member_from_group_conversation` (trigger) | `messenger_participants` | Track group leaves | LIVE (kept) |

**Net: nothing more to do for the "pivot."** The dead code that motivated
the audit is gone. social_* and messenger_* coexist intentionally.
