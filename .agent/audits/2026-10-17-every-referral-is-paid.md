# Every referral is recorded and paid (2026-10-17)

Owner instruction, Dan, 2026-10-17: "YES PAY OUT DIAMONDS FOR ALL REFERRALS".

## What was read

- `public.referrals`: 0 rows, ever. `profiles.referred_by`: NULL on every account.
- Four accounts arrived through kingfish's (player #1) Club Arena invite link,
  each carrying `ref=1` in `auth.users.raw_user_meta_data.club_join_path`:
  Papa (2026-10-16 14:01 UTC), Dinodollars (2026-10-17 00:43), MrWick007
  (01:51, email never confirmed) and TomTomTamale (13:54).
- No `referral_qualified` or `referral_referee` diamond award existed for any of them.
- All diamond multipliers involved were 1.00.

## Cause

The sign-up page stored the referrer only in the browser's localStorage. The
reward endpoint read `public.referrals`, which no code path wrote, and it also
withheld payment until the referee had a verified phone, a seven-day-old
account and five login days. As a result no referral was ever recorded or paid.

## Fix

Migration `20261017223126_a_referral_is_recorded_and_paid_when_the_new_player_confirms.sql`.
It lives in the Club Arena repo, Smarter-Poker-Club-Arena #7326. The database is shared, and it is applied through Apply Merged Migration because the cloud session's direct `apply_migration` calls returned `cancelled`.

- `fn_settle_signup_referral` reads the referrer from the account's own
  sign-up record. It records the referral and pays 500 to the referrer and 100
  to the referee through `award_diamonds_v2`, using the reference ids the
  endpoint always used, so no second door can pay twice.
- Triggers on `auth.users` run it when an email is confirmed. They run inside
  a savepoint, so a referral can never block a sign-up.
- The sign-up page writes `referral_player_number` (or `referral_code`) from
  what was entered, without waiting for the debounced check. It reads `ref=`
  from the invite redirect. The endpoint is a second live door to the same
  function.

## Other referral defects fixed in the same pass

- Every Referral Crew share link pointed at `smarter.poker/?ref=<code>`. The
  homepage dropped `ref`, and the sign-up form would have treated
  `SP-56737B` as a promo code. 2,311 accounts hold such a code, so no shared
  link ever credited anyone. The homepage now carries `ref` into every Sign Up
  door, the form and validator accept crew codes, the database resolves
  `referral_code`, and share links use `/auth/signup?ref=<player number>`.
- The sign-up form skipped validation for codes under three characters, so
  player numbers 1 to 99 (kingfish is 1) never showed "Referral Code
  Accepted".
- The form threw on any non-2xx answer, so "No player found" and "expired"
  were never shown to the player.
- `/api/social/referral` counted only the legacy `referral_bonus` type, quoted
  100 per referral, and paid its own 100/50 with hand-written reversal
  entries. It now counts both types, quotes the catalog, and settles "apply"
  through `fn_settle_signup_referral`.
- `ViralGrowthModule` embedded `referee:referee_id(...)`, which points at
  `auth.users`, so its referral list never loaded. It now reads the API.

## Settlement

| Player       | Paid                       | Why                                     |
|--------------|----------------------------|-----------------------------------------|
| Papa         | 100; kingfish 500          | Confirmed; arrived on kingfish's link   |
| Dinodollars  | 100; kingfish 500          | Confirmed; arrived on kingfish's link   |
| TomTomTamale | 100; kingfish 500          | Confirmed; arrived on kingfish's link   |
| MrWick007    | nothing yet                | Email not confirmed; paid on confirming |

Proved first in a self-aborting probe of the exact award calls, which returned:

- kingfish +1500;
- each referee +100;
- a replayed award refused as `duplicate`.

Afterwards the database held 0 referrals and 0 awards. The migration asserts
the same numbers and aborts if anything else is found.

## Accepted trade-off

Payment no longer waits for a phone check or for the referee's activity. So
any account that confirms an email earns its referee 100, and earns the player
number it names 500. That is the owner's instruction.
