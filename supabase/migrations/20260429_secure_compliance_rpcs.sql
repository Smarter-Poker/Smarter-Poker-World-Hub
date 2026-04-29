-- SECURITY HARDENING: lock down SECURITY DEFINER RPCs that mutate compliance,
-- regulatory, and financial state. These are all called by trusted server
-- endpoints (with service_role); none have legitimate browser callers.
--
-- Pre-fix vulnerability: every one of these accepted arbitrary user-id-shaped
-- params with no auth check, granted EXECUTE to PUBLIC + anon. Concrete
-- attacks anyone could mount via direct curl with the public anon key:
--
--   COMPLIANCE / LEGAL:
--     fn_set_age_verified(victim, country)              -> mark victim 18+ in any jurisdiction
--     fn_kyc_start_inquiry(victim, ...)                 -> spam KYC inquiries
--     fn_kyc_resolve_inquiry(...)                       -> resolve any KYC outcome
--     fn_delete_user_gdpr(victim, ...)                  -> trigger user deletion
--
--   RESPONSIBLE GAMING:
--     fn_rg_set_limits(victim, ...)                     -> remove/modify deposit limits
--     fn_rg_self_exclude(victim, hours)                 -> force-exclude any user
--     fn_rg_start_session(victim) / fn_rg_end_session(victim) -> session manipulation
--     fn_set_user_jurisdiction(victim, country)         -> already-authenticated; not in this list
--
--   FINANCIAL / SETTLEMENT:
--     add_bbj_contribution / award_bbj / fn_bbj_payout  -> bad-beat-jackpot manipulation
--     calculate_cascading_commission / record_rake      -> rake/commission tampering
--     settle_hand_atomically                             -> hand-result tampering
--     fn_claim_settlement_period / fn_close_settlement_period / fn_finalize_settlement_period
--                                                       -> rakeback period manipulation
--
--   FORENSIC INTEGRITY:
--     fn_log_admin_action(p_admin_user_id, ...)         -> forge admin audit trail
--
--   MONETIZATION:
--     unlock_free_avatars(victim)                       -> grant any user free avatars
--
-- All of these are server-only operations. Locking to service_role-only.
-- If any future code legitimately needs browser access to one of these, that
-- code MUST go through a server endpoint that performs proper authorization.
--
-- Sweep 5 of the audit, 2026-04-29.

-- ─── Compliance / regulatory ──────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_set_age_verified(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_kyc_start_inquiry(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_kyc_resolve_inquiry(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_delete_user_gdpr(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_mark_gdpr_completed(uuid) FROM PUBLIC, anon, authenticated;

-- ─── Responsible gaming ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_rg_set_limits(uuid, numeric, numeric, numeric, numeric, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_rg_self_exclude(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_rg_start_session(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_rg_end_session(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_rg_should_show_reality_check(uuid) FROM PUBLIC, anon, authenticated;

-- ─── Financial / settlement (called from triggers + service_role server endpoints) ───
REVOKE EXECUTE ON FUNCTION public.add_bbj_contribution(uuid, uuid, numeric, numeric, integer, text, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_bbj(uuid, uuid, bigint, uuid, text, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, text, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_bbj_payout(uuid, uuid, uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_cascading_commission(uuid, uuid, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_rake(uuid, uuid, uuid, numeric, numeric, integer, jsonb, boolean, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_hand_atomically(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_claim_settlement_period(text, text, uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_close_settlement_period(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_finalize_settlement_period(uuid, text, integer, integer, numeric, numeric, jsonb, text) FROM PUBLIC, anon, authenticated;

-- ─── Forensic integrity ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_log_admin_action(uuid, text, text, text, jsonb, jsonb, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;

-- ─── Monetization ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.unlock_free_avatars(uuid) FROM PUBLIC, anon, authenticated;
