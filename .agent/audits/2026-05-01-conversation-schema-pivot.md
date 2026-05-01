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

## When the pivot completes

Once `messenger_*` has fully replaced `social_conversations` (i.e.
all callers in `pages/api/messenger/`, `pages/hub/messenger.js`,
`pages/api/club-arena/*-cashout.js`, etc. have been moved), the
jsonb overload can be dropped. Don't do it before that.
