# The RPC calls that never reached a function

2026-09-08. Closing the four real defects the money-door scanner found when the
phase 7 deep dive widened it from one directory to the whole World Hub server
side (`pages/api`, `src/lib`, `lib` — 1,076 files, 323 `.rpc()` calls). They
were reported then and left for their lanes; this is their lane now.

## Why a wrong parameter name is not a wrong value

PostgREST resolves a function overload by its **argument names**, not by
position or type. A call carrying a name no signature declares does not get a
wrong answer — it gets **PGRST202, "no function matches"**, which is a 404. So
each of these has failed on *every* call since the day it was written, and none
of them ever half-worked.

## The four

| call | sent | live signature | effect |
| --- | --- | --- | --- |
| `fn_rg_self_exclude` | `p_until` (timestamp) | `(p_user_id uuid, p_duration_hours integer)` | **self-exclusion has never once worked** |
| `fn_rg_should_show_reality_check` | `p_user_id`, `p_ack` | `(p_user_id uuid)` | reality checks never shown |
| `get_auth_users_by_email` | `email_pattern` | `(p_email text)` | admin lookup always errored |
| `get_user_level_stats` | `p_user_id`, `p_level_id` | `(p_user_id uuid)` | **the caller was right; the function was a stub** |

### 1. Self-exclusion — the one request that must never fail

A player asking to be kept out got a 500. The route already accepts `duration`
(`24h`/`7d`/`30d`/`permanent`) or an explicit `until`, and that public API is
unchanged — the conversion belongs in the route, not in its callers. Hours are
rounded **up**, so a converted exclusion is never shorter than the one asked
for, and `permanent` sends `0`, which is the function's own encoding for
`'infinity'`.

**A second bug sat underneath it.** `fn_rg_self_exclude` does not raise when it
declines to shorten an existing exclusion — it returns
`{ok:false, error:'cannot_shorten_exclusion'}`. The route's error branch tested
`error.message` for that wording, which it could never have matched, and handed
the refusal back as **HTTP 200**. A refusal is now 409.

### 2. Reality check — the function acknowledges itself

`?ack=true` was invented for a `p_ack` argument that has never existed. The live
function appends `now()` to `reality_check_shown_at` itself on the poll that
decides to show. The query parameter is still accepted and ignored, so any
caller already sending it keeps working rather than starting to 400.

### 3. Admin auth lookup — a plain rename

`email_pattern` -> `p_email`.

### 4. Level stats — the database was fixed, not the call

This one is the opposite of the others. `get_user_level_stats(p_user_id)`
returned a hard-coded `{xp:0, level:1, xp_to_next:0, progress_pct:0}` — an XP
shape, from a function named for level statistics, read by a caller that wants
`{total_questions, correct_answers, accuracy, avg_ev_loss}`. Renaming the call
to match the stub would have made a broken call succeed and return four fields
nobody reads, which is worse than the honest 404.

`training_answers` holds the real data (1,967 rows: `user_id`, `game_id`,
`level`, `is_correct`, `ev_loss`), so **the migration adds the
`(p_user_id, p_level_id)` overload the caller has always asked for**, computed
from it, and `lib/game-engine-service.ts` is left as it was.

The one-argument stub stays, because Club Arena's `useArenaStore.loadStats`
still calls it — expecting a third shape again
(`{total_clubs, active_tables, active_players, ...}`). That action has no
caller: `useArenaStore` is used by `MasterBus` for `getState()` and `reset()`
only, and `loadStats` is never invoked. Noted rather than deleted; it moves no
money and breaks no page.

## Not fixed here

`pages/api/stripe.js` carries a deliberate fallback to a renamed function and
is correct as it stands.
