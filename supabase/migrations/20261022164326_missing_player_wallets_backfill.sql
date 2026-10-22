-- ═══════════════════════════════════════════════════════════════════════
-- 20261022164326_missing_player_wallets_backfill.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (signup audit, 2026-10-22)
-- AFFECTS:     public.wallets (insert of missing zero-balance PLAYER rows)
-- IRREVERSIBLE: no (rows are zero-balance and can be deleted if unused)
--
-- WHY:
-- 77 players had no PLAYER wallet. handle_new_user_v2_create_wallet's INSERT
-- is refused by the hourly maintenance freeze (PLATFORM_FROZEN, 55006) and the
-- trigger only logs to signup_errors, so anyone who signed up during a break
-- never got a wallet. Credits created one lazily, but escrow tracking
-- (ChipBridge) and the signup probe treat a missing wallet as a failure.
--
-- WHAT: create the missing rows at zero balance; existing wallets untouched.
-- No money moves. Going forward, /api/auth/ensure-profile re-asserts the
-- PLAYER wallet on its throttled presence write, so a freeze-refused signup
-- heals on the player's next session.

BEGIN;

DO $pre$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = p.id AND w.wallet_type = 'PLAYER');
  IF n > 200 THEN
    RAISE EXCEPTION 'expected about 77 profiles without a PLAYER wallet, found %', n;
  END IF;
END
$pre$;

INSERT INTO public.wallets (user_id, wallet_type, balance, locked_balance)
SELECT p.id, 'PLAYER', 0, 0
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = p.id AND w.wallet_type = 'PLAYER')
ON CONFLICT (user_id, wallet_type) DO NOTHING;

DO $post$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = p.id AND w.wallet_type = 'PLAYER');
  IF n <> 0 THEN
    RAISE EXCEPTION '% profiles still have no PLAYER wallet', n;
  END IF;
END
$post$;

COMMIT;
