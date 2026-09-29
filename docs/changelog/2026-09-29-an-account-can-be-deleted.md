# 2026-09-29 - An account can be deleted again

Found during the Club Arena app's store-readiness walkthrough (Settings, Close
Account, Close My Account on the Android emulator): `DELETE
/api/auth/delete-account` answered 500 for every account. The World Hub
settings page calls the same endpoint, so nobody could delete an account from
anywhere. Apple (App Review 5.1.1(v)) and Google Play both require that an
account created in the app can be deleted from the app.

## Why it failed

The endpoint hard-deleted the player's rows with the service role, then
hard-deleted the Auth user. The database had since made two things true that
the endpoint was never taught:

1. `service_role` holds no write privilege on `cashout_requests` (money moves
   only through the cashier's definer functions), so the first write, "cancel
   pending cashouts", failed with 42501 for every account.
2. Financial journals are append-only, and every account is born with one:
   The Mint's signup grant in `diamond_transactions`. That journal references
   `profiles` and `auth.users` ON DELETE CASCADE, so deleting either cascades
   into it and is refused (P0403). No account could ever be hard-deleted.

## This change (World Hub)

The endpoint no longer touches a table. After the auth, rate-limit and
step-up MFA gates it:

1. calls `fn_close_account(p_user_id)` (Club Arena migration
   `20260929051751`), which closes the account in one transaction or refuses
   and changes nothing;
2. on a refusal answers 400 with the instruction as `error` (both callers show
   `error` as it is) and the reason code; an unknown reason answers 500;
3. soft-deletes the Auth user, `auth.admin.deleteUser(id, true)`: email and
   phone obfuscated, identities and sessions removed, the row kept so nothing
   cascades into the journals;
4. marks the erasure record completed (`fn_mark_gdpr_completed`), best effort.

A retry after a partial failure is safe: the function answers
`already_closed` with the open request id, and the endpoint finishes the Auth
step.

`__tests__/delete-account-closes-the-account.test.mjs` runs the real handler
with every dependency stubbed and pins the single RPC, the soft delete, an
instruction for every refusal reason, and that a refusal or a failure never
reaches the Auth user. It is imported by `_test-guards-exist.test.mjs`, which
CHECK 8 runs.

## What the database does (Club Arena)

`fn_close_account` refuses while the player still holds money or authority,
using the club's own departure rules plus the platform's financial precheck;
then leaves every club the way the club's departure path does, deletes the
personal non-financial rows, scrubs every name, contact, location, social
link, avatar, bio, birthday and preference from the profile (a tombstone
username and status `deleted` remain), and records the closure in
`gdpr_deletion_requests`. Financial journals are kept, keyed by an id that no
longer points at anyone.

## Not changed

`/api/account/delete-gdpr` and `/api/admin/users/delete-gdpr` still hard-delete
the Auth user after `fn_delete_user_gdpr`, so they hit the same cascade. No
page calls either; they are reported, not changed here.
