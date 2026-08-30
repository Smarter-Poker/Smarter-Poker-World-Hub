# 2026-08-30 — Profile initialisation was failing on every call, and blocking every deploy

Found while chasing a red check on an unrelated push PR. Two separate defects
in `initialize_player_profile`, one of which had taken the whole estate's
deploy pipeline hostage.

## How it surfaced

World-Hub #1008 failed **CHECK 10: Diamond economy invariants** on
`no_profiles_balance_drift` — "profiles where diamonds <> diamond_balance".
That reads like a live currency defect. It was not. One profile drifted:

```
username club-arena-prod-e2e-2-20260830115258
created  2026-08-30 17:00:14
diamonds 500,  diamond_balance 0
```

A throwaway account from the "Post-Deploy E2E (production)" workflow, whose run
ended `skipped` and never cleaned up. **The failure lands on whoever opens the
next pull request, not on whoever caused it**, and it stays red for everyone
until somebody hand-corrects the row.

## Defect 1 — the welcome bonus went to one half of a mirrored pair

`profiles.diamonds` and `profiles.diamond_balance` are a mirrored pair. Two of
the invariants CHECK 10 enforces are literally named
`add_diamonds_writes_both_balance_columns` and
`deduct_diamonds_writes_both_balance_columns`.

`initialize_player_profile` inserted the 500 diamond welcome bonus into
`diamonds` and never mentioned `diamond_balance`, which took its column default
of `0`. **Every profile it created was born violating the invariant its own
repo enforces.** No trigger reconciles the two columns — checked; there are
twelve triggers on `profiles` and none of them touch a diamond column.

Fixed in `20260830_signup_writes_both_diamond_columns.sql`. `ON CONFLICT` was
deliberately left alone: its `DO UPDATE` branch never writes either column, so
a returning player's balance is not rewritten by a re-initialise. This creates
no currency — it writes the same 500 to the second column of a pair required to
hold one value.

## Defect 2 — it had started failing outright, and said nothing

Probing the function inside a rolled-back transaction returned:

```
success = false
message = duplicate key value violates unique constraint "uq_profiles_player_number"
```

It **catches its own exception and reports failure in a result column**, so
nothing raises and nothing alerts. A caller that does not inspect `success`
sees a successful call that created nothing.

`profiles.player_number` is UNIQUE across everyone, and a canonical allocator
already exists: `fn_next_player_number()` draws from `player_number_seq` and
loops until it finds a number no profile holds. The BEFORE INSERT trigger
`trg_profiles_assign_player_number` calls it — but only `IF NEW.player_number
IS NULL`. This function supplied its own value from a **different** sequence
with no free-number check, so the trigger deferred to a number already taken:

| | |
| --- | ---: |
| `public_player_number_seq` at | 1502 |
| profiles holding a number ≤ 1502 | 169 |
| `max(player_number)` | 1000002 |

This was recent, and that is the shape of the bug: a profile with this
function's fingerprint (`skill_tier 'Newcomer'`, `diamonds 500`) was created at
17:00:14 the same day. The sequence walks forward into occupied territory and
then fails for everyone, quietly.

Fixed in `20260830_signup_uses_collision_safe_player_number_allocator_v2.sql`.
Employees keep drawing from their own sequence first because that numbering is
deliberate, but that branch now checks for a free number too — the UNIQUE
constraint spans both populations — and is bounded, because an exhausted
sequence must raise rather than hang a signup.

## Proof

The same rolled-back probe, before and after. Nothing was committed; the answer
travels out in the exception message, which survives the rollback.

```
BEFORE  success=f  message=duplicate key value violates unique constraint "uq_profiles_player_number"
AFTER   success=t  player_number=1000003  diamonds=500 diamond_balance=500 aligned=t
```

## Guards

`economy_invariants` — the function CHECK 10 calls — gained two checks in
`20260830_economy_invariants_cover_signup_profile_initialisation.sql`:

- `signup_seeds_both_diamond_columns`
- `signup_allocates_a_free_player_number`

`no_profiles_balance_drift` already existed and did catch defect 1 — but only
**after** an affected account existed, and it names the symptom rather than the
cause. These name the cause, in the same run, before an account is made.
Nothing caught defect 2 at all. All 14 invariants are green.

Both assertions strip `--` comments from `prosrc` before searching. The first
attempt at the allocator fix **aborted on its own post-condition**, because the
comment explaining the fix mentioned the retired sequence and the assertion
searched the raw definition. An assertion must read code, never prose. (Third
time this exact trap appeared today; the other two were JS tests matching their
own explanatory comments.)

## Still open

- **The E2E workflow leaks fixture accounts.** `post-deploy-e2e.yml` has no
  cleanup step at all, and the specs that create accounts were not found in the
  Club Arena repo's `tests/e2e`. Cleanup should run on every exit path, not
  just success. Until then a leaked fixture is harmless to the invariant —
  because signup now seeds both columns — but it still leaves junk accounts.
- **Who actually calls `initialize_player_profile`.** No application caller was
  found in either repo (only a generated type in `src/types/supabase.ts`), yet
  something created a profile bearing its exact fingerprint at 17:00:14. Worth
  establishing, because a signup path nobody can point at is a signup path
  nobody is testing.
