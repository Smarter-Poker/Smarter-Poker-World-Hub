-- Applied to production 2026-08-19 via Supabase MCP. Mirrored per CLAUDE.md RULE 2.
--
-- CRITICAL: credit_club_wallet_rake was a CHIP-MINTING HOLE.
-- SECURITY DEFINER + granted to `authenticated` + ZERO authorization. Body:
--   UPDATE club_wallets SET chip_balance = chip_balance + (p_rake - p_bbj)
-- with p_rake supplied entirely by the caller, plus a forged 'rake_in' row in
-- club_wallet_transactions.
--
-- PROVEN with a rolled-back probe as role `authenticated` carrying a real
-- player's JWT claim: minted 999,975.23 chips into SHARK CLUB inside the txn;
-- ROLLBACK reverted it, real balance verified intact afterwards.
-- Beyond minting it forges rake accounting, which corrupts agent commission
-- and rakeback downstream because both derive from recorded rake.
--
-- Also revoked (no caller check, cross-club, zero client callers):
--   fn_sync_tournament_chips, get_daily_chip_summary, sum_chip_transactions
--
-- Verified every caller before revoking: engine (service_role) and World Hub
-- API routes only. ZERO browser call sites. service_role retains EXECUTE.
--
-- Post-verify in prod: player_can_mint=false, engine_can_credit=true, and the
-- club balance kept growing from legitimate rake (1,286,388.77 -> 1,286,550.29)
-- confirming no regression.
REVOKE EXECUTE ON FUNCTION public.credit_club_wallet_rake(uuid,numeric,numeric,uuid,integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.fn_sync_tournament_chips(uuid,jsonb)                        FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_chip_summary(uuid,text,integer)                   FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.sum_chip_transactions(uuid,text,timestamptz,timestamptz)    FROM authenticated, anon;
