-- PASS 6: FINANCIAL NULLABILITY AUDIT (Base tables only)
-- Locking down critical financial columns to prevent NULL propagation corruption

-- 1. Update any existing NULLs to 0
UPDATE public.player_wallets SET diamonds = 0 WHERE diamonds IS NULL;
UPDATE public.diamond_wallets SET balance = 0 WHERE balance IS NULL;
UPDATE public.wallets SET balance = 0 WHERE balance IS NULL;
UPDATE public.player_stats SET total_winnings = 0 WHERE total_winnings IS NULL;
UPDATE public.player_stats SET total_rake = 0 WHERE total_rake IS NULL;
UPDATE public.club_diamond_wallets SET balance = 0 WHERE balance IS NULL;
UPDATE public.club_financial_summary SET total_rake = 0 WHERE total_rake IS NULL;
UPDATE public.union_wallets SET chip_balance = 0 WHERE chip_balance IS NULL;
UPDATE public.club_members SET chip_balance = 0 WHERE chip_balance IS NULL;
UPDATE public.club_members SET diamonds = 0 WHERE diamonds IS NULL;
UPDATE public.profiles SET diamonds = 0 WHERE diamonds IS NULL;
UPDATE public.clubs SET total_rake = 0 WHERE total_rake IS NULL;
UPDATE public.bankroll_history SET balance = 0 WHERE balance IS NULL;
UPDATE public.unions SET total_rake = 0 WHERE total_rake IS NULL;
UPDATE public.tournaments SET total_rake = 0 WHERE total_rake IS NULL;
UPDATE public.bot_profiles SET diamonds = 0 WHERE diamonds IS NULL;

-- 2. Alter columns to SET NOT NULL
ALTER TABLE public.player_wallets ALTER COLUMN diamonds SET NOT NULL;
ALTER TABLE public.diamond_wallets ALTER COLUMN balance SET NOT NULL;
ALTER TABLE public.wallets ALTER COLUMN balance SET NOT NULL;
ALTER TABLE public.player_stats ALTER COLUMN total_winnings SET NOT NULL;
ALTER TABLE public.player_stats ALTER COLUMN total_rake SET NOT NULL;
ALTER TABLE public.club_diamond_wallets ALTER COLUMN balance SET NOT NULL;
ALTER TABLE public.club_financial_summary ALTER COLUMN total_rake SET NOT NULL;
ALTER TABLE public.union_wallets ALTER COLUMN chip_balance SET NOT NULL;
ALTER TABLE public.club_members ALTER COLUMN chip_balance SET NOT NULL;
ALTER TABLE public.club_members ALTER COLUMN diamonds SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN diamonds SET NOT NULL;
ALTER TABLE public.clubs ALTER COLUMN total_rake SET NOT NULL;
ALTER TABLE public.bankroll_history ALTER COLUMN balance SET NOT NULL;
ALTER TABLE public.unions ALTER COLUMN total_rake SET NOT NULL;
ALTER TABLE public.tournaments ALTER COLUMN total_rake SET NOT NULL;
ALTER TABLE public.bot_profiles ALTER COLUMN diamonds SET NOT NULL;
