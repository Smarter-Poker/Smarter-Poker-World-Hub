# Severity 1: every signed-in user's own data was throwing a permission error

**Date:** 2026-08-26
**Found:** while reviewing a migration written for the `/horses` admin audit.
**Applied:** six migrations — 20260826201313 / 201941 / 202004 / 202154 /
210000 / 211000.
**Blast radius:** 47 tables, every authenticated user on the platform.

---

## What was wrong

44 tables in `public` carry a SELECT policy of the shape:

```sql
auth.uid() = user_id OR public.fn_is_platform_admin()
```

`authenticated` had **no EXECUTE privilege** on `fn_is_platform_admin()`.

The instinct is that this only matters for admins, because a normal user's own
rows satisfy the left side of the OR. That is wrong. **Postgres does not
short-circuit the OR here** — the function is evaluated regardless, and the
privilege check fires before the boolean does. Probed inside a rolled-back
transaction as the `authenticated` role with `request.jwt.claims` set to a real
`profiles` row:

```
SELECT count(*) FROM user_notifications WHERE user_id = <own id>
  -> ERROR: permission denied for function fn_is_platform_admin
SELECT count(*) FROM direct_messages    WHERE sender_id = <own id>
  -> ERROR: permission denied for function fn_is_platform_admin
SELECT count(*) FROM user_bookmarks
  -> ERROR: permission denied for function fn_is_platform_admin
```

So a signed-in player opening their notifications, their messages, their
bookmarks, their purchase history, their devices, their notification
preferences, their saved hands or their disputes got a **hard error**, not an
empty list. On 44 tables:

`_audit_phase40_results, abuse_logs, admin_audit_log, bbj_payout_recipients,
bbj_payouts, commander_activity_log, commander_leads,
commander_onboarding_leads, commander_player_reputation,
commander_player_reputation_scores, commander_rate_limits,
commander_system_log, cron_execution_log, direct_messages, disputes,
friend_requests, gdpr_deletion_requests, hand_players, hendon_scrape_log,
horse_analytics, horse_error_log, live_game_confirmations,
live_help_analytics, live_help_reactions, notification_preferences,
notification_prompt_log, pending_calls, promo_codes_used, purchase_history,
pwa_prompt_log, qr_code_scans, rake_history, rakeback_distributions,
sandbox_bookmarks, sandbox_saved_hands, settlement_invoices, settlement_locks,
signup_abuse_log, system_cache, system_logs, union_rakeback_log,
user_bookmarks, user_devices, user_notifications`

## Why the fix is a grant and not a policy rewrite

The whole function is:

```sql
IF auth.uid() IS NULL THEN RETURN false; END IF;
SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
RETURN v_role IN ('admin','superadmin','god');
```

`STABLE SECURITY DEFINER`, `search_path` pinned, owned by `postgres`, zero
arguments, reads only the caller's own profile row. The only fact it discloses
is whether the caller is an admin — which the caller already knows. It grants
no data access by itself; every policy that calls it still applies its own
predicate.

`anon` was deliberately not granted.

**Confinement re-verified after the change**, on a table with rows:

| | expected | actual |
|---|---|---|
| `admin_audit_log` as a plain user | 0 of 9 | **0** |
| `admin_audit_log` as a god | 9 | **9** |
| `live_help_tickets` as a plain user | 0 of 5 | **0** |

## Three more faults found in the same sweep

**`live_help_tickets` RLS.** Both policies gated on
`role IN ('admin','super_agent','owner')` — missing `superadmin` and `god`, the
roles the two owner accounts actually hold — plus a hardcoded email allowlist.
`admin@smarter.poker` does not exist in `profiles`; **`support@smarter.poker`
does, with role `user`**, so an ordinary account had read and write over every
support ticket. Nobody holds `super_agent` or `owner` at all. Replaced with
`fn_is_platform_admin()`. All three admins now see all 5 tickets; a plain user
sees 0.

**`fn_get_home_games_onboarding_status_admin`** had no EXECUTE grant for
`authenticated`, so the Onboarding tab 42501'd even once its route was fixed.

**`list_home_ban_appeals_admin` — an IDOR waiting to happen.** It was the only
one of the seven Home Games moderation RPCs that was SECURITY INVOKER, so it
failed with `permission denied for table commander_home_members` when called as
the signed-in admin. But its guard checks the role of `p_caller_user_id` — a
**caller-supplied parameter** — and never compares it to `auth.uid()`. Under
INVOKER, RLS was the thing actually containing it. Promoting it to SECURITY
DEFINER to fix the first fault would have opened a clean IDOR: any signed-in
user could pass a god's uuid and read every ban appeal, with the banned
member's display name, avatar and ban reason. Both were fixed in one migration.

Verified after: god with own id → OK; plain user with a god's id → **refused
UNAUTHORIZED**; plain user with own id → refused FORBIDDEN.

## The check that would have caught it, and what it found

`scripts/ci/check-policy-function-grants.mjs`, wired into the Supabase
Invariants workflow as **U4.4**. For every policy in `public`, for every
function its USING / WITH CHECK expression names, for every role the policy
targets, it asserts `has_function_privilege(role, fn, 'EXECUTE')`.

It is backed by `fn_policy_function_grant_gaps()` -- a purpose-built read-only
catalog function granted to `service_role` only -- rather than arbitrary SQL.
`exec_sql` and `run_sql` both exist in this database and are both permanently
disabled for security, which is correct; CI has no business holding a
capability that broad.

**On its first run it found three more broken tables**, which this audit had
missed entirely: `disputes`, `settlement_invoices` and `settlement_locks`, all
calling `fn_is_club_admin_uid(uuid)`, which `authenticated` also could not
execute. `disputes` is player-facing -- a player could not read their own
dispute. Fixed by the same kind of grant, and the check is green.

It is **enforcing from the start** rather than starting non-blocking like U4.2
and U4.3, because it is currently clean and any regression here is a
user-visible outage rather than a backlog item.

## How this went unnoticed

The `/horses` Bug Reports tab was the symptom that led here: it rendered empty
for two of three admins, and its updates silently no-oped because a PostgREST
UPDATE matching zero rows returns `{ error: null }`. Chasing why produced the
`live_help_tickets` policy, which produced `fn_is_platform_admin`, which
produced the other 43 tables.

Nothing in CI checked that a policy's function dependencies are executable by
the roles the policy targets. That gap is now closed (see above), and closing
it immediately surfaced three tables this manual sweep had not found.

## Still open

- **A performance problem behind the same function.** `SELECT count(*) FROM
  rake_history` (1,372,780 rows) as `authenticated` now **times out** — the
  policy evaluates per row. It is correctness-neutral but the table is
  effectively unqueryable from a client. Worth a targeted index or a policy
  that can be pushed down.
- The audit-log coverage gap: `admin_audit_log` held 9 rows for a console with
  this many destructive buttons.
