# 2026-09-29 - A player's full birthday is theirs alone

Found during the Club Arena app's store-readiness walkthrough: any signed-in
account could read every player's exact date of birth. `birthday` was in
`SAFE_PROFILE_COLUMNS`, the allow-list this site uses to read a STRANGER's
profile (`/hub/user/<name>`, `useProfilePrefetch`), so every profile view
fetched the subject's birthday, and the column's SELECT grant meant any account
could also filter all profiles by it (`?birthday=not.is.null`, then narrow by
range) straight from the REST API.

Nothing shows the date to anyone but its owner:

- the profile editor reads it through `get_my_full_profile()`, which is
  SECURITY DEFINER and returns the caller's own row only;
- the birthday reward (`/api/rewards/birthday-reward`) reads it server-side
  with the service role;
- the public profile shows `birth_year` ("Born In <year>"), which stays.

## This change (World Hub)

`birthday` moves from `SAFE_PROFILE_COLUMNS` to `SENSITIVE_PROFILE_COLUMNS`,
and `__tests__/safe-profile-columns-are-granted.test.mjs` now lists it among
the columns `authenticated` cannot select (it fails against the old list).

## What follows it (Club Arena, database)

Once this is live, the Club Arena migration
`the_full_birthday_is_its_owners_alone` revokes `SELECT (birthday)` on
`public.profiles` from `authenticated` (anon never had it). The ORDER matters:
Postgres refuses a whole statement that names one ungranted column, so
revoking first would have taken every public profile page down with "User
Not Found" - the 2026-09-03 failure this test was written for. Writing a
birthday (signup, the profile editor, the Club Arena age gate's
`fn_set_my_birthday`) is unaffected: those need INSERT/UPDATE or run as
definer, not SELECT.
