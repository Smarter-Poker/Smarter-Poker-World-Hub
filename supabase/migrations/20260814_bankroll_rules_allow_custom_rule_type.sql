-- Second blocker behind the never-worked custom-rules feature (2026-08-14):
-- after adding label/description/unit, a live insert round-trip STILL failed —
-- bankroll_rules_rule_type_check is a closed enum of the 8 premade types and
-- predates the custom-rules UI, which writes rule_type 'custom_<epoch-ms>'.
-- Widen it to also accept the custom_ prefix.
-- Applied to production via Supabase MCP apply_migration 2026-08-14; verified
-- by synthetic insert round-trip (custom_ accepted, junk still 23514).
--
-- ROLLBACK:
--   ALTER TABLE public.bankroll_rules DROP CONSTRAINT bankroll_rules_rule_type_check;
--   ALTER TABLE public.bankroll_rules ADD CONSTRAINT bankroll_rules_rule_type_check
--     CHECK (rule_type = ANY (ARRAY['stop_loss_session','stop_loss_day','stop_loss_month',
--       'max_buyin_percent','max_mtt_percent','shot_take_threshold','win_goal_session',
--       'time_limit_session']));
--   (Safe only if no custom_% rows exist; delete them first or the ADD will fail.)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.bankroll_rules'::regclass
                   AND conname='bankroll_rules_rule_type_check') THEN
    RAISE EXCEPTION 'expected constraint bankroll_rules_rule_type_check not found — schema drifted, investigate';
  END IF;
END $$;

ALTER TABLE public.bankroll_rules DROP CONSTRAINT bankroll_rules_rule_type_check;
ALTER TABLE public.bankroll_rules ADD CONSTRAINT bankroll_rules_rule_type_check
  CHECK (
    rule_type = ANY (ARRAY[
      'stop_loss_session'::text, 'stop_loss_day'::text, 'stop_loss_month'::text,
      'max_buyin_percent'::text, 'max_mtt_percent'::text, 'shot_take_threshold'::text,
      'win_goal_session'::text, 'time_limit_session'::text
    ])
    OR rule_type LIKE 'custom\_%'
  );

DO $$
BEGIN
  IF NOT (SELECT convalidated FROM pg_constraint
          WHERE conrelid='public.bankroll_rules'::regclass
            AND conname='bankroll_rules_rule_type_check') THEN
    RAISE EXCEPTION 'constraint not validated after re-add';
  END IF;
END $$;
