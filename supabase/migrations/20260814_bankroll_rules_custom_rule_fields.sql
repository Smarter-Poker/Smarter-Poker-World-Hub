-- CHECK 13 finding (2026-08-14): BankrollRulesCard's "add custom rule" insert
-- writes label/description/unit, which never existed on bankroll_rules — the
-- insert 42703'd on every attempt, so no user has EVER created a custom
-- bankroll rule. The UI reads all three back with graceful fallbacks
-- (cr.label || cr.rule_type, cr.unit || '$'), so additive nullable columns
-- complete the feature exactly as designed. Tier 2: additive only, no
-- defaults, no rewrites, existing rows unaffected.
-- Applied to production via Supabase MCP apply_migration 2026-08-14.

DO $$
BEGIN
  IF to_regclass('public.bankroll_rules') IS NULL THEN
    RAISE EXCEPTION 'bankroll_rules does not exist — wrong database?';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='bankroll_rules'
               AND column_name IN ('label','description','unit')) THEN
    RAISE EXCEPTION 'one of label/description/unit already exists — investigate before applying';
  END IF;
END $$;

ALTER TABLE public.bankroll_rules
  ADD COLUMN label text,
  ADD COLUMN description text,
  ADD COLUMN unit text;

COMMENT ON COLUMN public.bankroll_rules.label IS 'Display name for custom_% rules; premade rules use client-side labels.';
COMMENT ON COLUMN public.bankroll_rules.unit IS 'Threshold unit for custom rules: $, %, or hrs.';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='bankroll_rules'
     AND column_name IN ('label','description','unit');
  IF n <> 3 THEN
    RAISE EXCEPTION 'post-apply assertion failed: expected 3 new columns, found %', n;
  END IF;
END $$;
