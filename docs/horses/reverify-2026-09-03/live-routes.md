# Live wiring proof, 2026-09-03

`next start` of the pushed head (849fe6381d, `/api/health` version `849fe638`) on the Mac, exercised with a real JWT for the `god` operator. Reads only, plus two writes the routes refuse by design (launch_all -> 410, generate-avatars with no key -> 0 generated).

Production database checked the same hour:
- `fn_ca_mint(p_asset, p_destination, p_target_id, p_amount, p_reason, p_op_id, p_class)` replays through `ca_op_claims` (exactly-once holds).
- `fn_ca_fund_club(p_club_id, p_amount, p_reason, p_idempotency_key)` - the JS executor was calling it with `p_op_id`. Fixed in this pass.
- `fn_log_admin_action` refuses a null actor; `admin_audit_log.admin_user_id` is nullable, so the direct-insert fallback in operatorAudit.js is the right fallback for the cron path.
- `check_rate_limit_strict(p_key, p_limit, p_window_seconds)` exists (durable limiter is live, not a 503).

| Route | Result |
| --- | --- |
| no bearer -> stable-admin | 401 envelope |
| DELETE economy-stats | 405 envelope with Allow |
| bad JWT | 401 |
| economy-stats, analytics, grinder-stats, admin-reviews, merch-catalog-admin, club-arena-admin overview, mint ledger/targets/player_search, operator-admin staff/roles/policy/approvals/audit_trail, hg-reports, hg-appeals | 200, `success`, `requestId` on every body, totals present where the contract says |
| anti-abuse unknown section, club-arena-admin unknown section, stable-admin unknown action | 400 `bad_request` naming the valid values |
| hg-onboarding-status without user | 400 `invalid_user_id` |
| trigger-pipeline GET / POST | 405 / 501 `not_built` |
| horse-launch status | 200 totalHorses/seatedHorses/activeTables/activeTournaments/checkedAt |
| horse-launch launch_all | 410 `retired` and an audit row `fleet.launch_refused` with actor_role, ip, user agent, request id |
| mint invalid body | 400 before any RPC |
| grant_role invalid user | 400 |
| decide_approval unknown id | 404 |
| execute_approval unknown id | 409 `execution_row_missing` (made 404 in this pass for consistency) |
| hg-gdpr-erase without confirmation | 400 `confirmation_required` |
| generate-avatars | 200, attempted 5 generated 0, audit row `avatar.generate` with the failures listed |
| /horses, ?tab=staff, ?tab=approvals, sql-console, hg-moderation, hand-reviews | 200 SSR shells |
