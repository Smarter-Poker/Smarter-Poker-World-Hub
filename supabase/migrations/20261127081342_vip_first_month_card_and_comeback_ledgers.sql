-- =====================================================================
-- 20261127081342_vip_first_month_card_and_comeback_ledgers.sql
-- =====================================================================
-- TIER:         2
-- AUTHOR:       Claude (VIP $1 first month follow-up)
-- AFFECTS:      new tables public.vip_intro_card_fingerprints,
--               public.vip_comeback_redemptions (RLS on, no policies)
-- IRREVERSIBLE: no (two new, empty, unreferenced tables)
--
-- WHY:
--   1. The $1 first month is once per ACCOUNT (vipIntroEligibility.js).
--      One person can open a second account and pay $1 again with the same
--      card. The Stripe webhook now records the card fingerprint of every
--      admitted $1 subscription here, and refunds and ends a $1 subscription
--      whose card already paid a $1 month for a different account
--      (src/lib/store/vipDiscountedAdmission.mjs).
--   2. The comeback price (first month 10 USD for a lapsed Card member,
--      src/lib/store/vipComebackOffer.mjs) is once per account.
--      vip_subscriptions keeps ONE row per user and recycles it for the next
--      subscription, so it cannot remember that a comeback month was used.
--      The webhook records each admitted comeback subscription here.
--
-- HOW:
--   - Two small tables, written only by the service role from the webhook.
--   - No foreign keys: a key to profiles/auth.users would lock a hot table
--     on every insert, and an orphan row here is harmless.
--   - RLS enabled with no policies: anon/authenticated see nothing.
--   - One transaction; no data change; nothing else is touched.
-- =====================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';

DO $$
BEGIN
  IF to_regclass('public.vip_intro_card_fingerprints') IS NOT NULL
     OR to_regclass('public.vip_comeback_redemptions') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: a VIP first-month ledger table already exists';
  END IF;
END $$;

CREATE TABLE public.vip_intro_card_fingerprints (
  fingerprint text PRIMARY KEY
    CHECK (length(fingerprint) BETWEEN 1 AND 255),
  first_user_id uuid NOT NULL,
  first_subscription_id text NOT NULL
    CHECK (length(first_subscription_id) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vip_intro_card_fingerprints IS
  'One row per card (Stripe card fingerprint) that has paid a VIP $1 first month, and the account it paid for. Written by the Stripe webhook only.';

CREATE TABLE public.vip_comeback_redemptions (
  user_id uuid PRIMARY KEY,
  stripe_subscription_id text NOT NULL UNIQUE
    CHECK (length(stripe_subscription_id) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vip_comeback_redemptions IS
  'One row per account that has been admitted on the VIP comeback first-month price, with that subscription. Written by the Stripe webhook only.';

ALTER TABLE public.vip_intro_card_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_comeback_redemptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.vip_intro_card_fingerprints FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.vip_comeback_redemptions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.vip_intro_card_fingerprints TO service_role;
GRANT SELECT, INSERT ON public.vip_comeback_redemptions TO service_role;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vip_intro_card_fingerprints'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vip_comeback_redemptions'::regclass) THEN
    RAISE EXCEPTION 'post-apply assertion failed: RLS is not enabled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid IN ('public.vip_intro_card_fingerprints'::regclass,
                        'public.vip_comeback_redemptions'::regclass)
  ) THEN
    RAISE EXCEPTION 'post-apply assertion failed: a policy exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE contype = 'f'
       AND conrelid IN ('public.vip_intro_card_fingerprints'::regclass,
                        'public.vip_comeback_redemptions'::regclass)
  ) THEN
    RAISE EXCEPTION 'post-apply assertion failed: a foreign key exists';
  END IF;
  IF has_table_privilege('anon', 'public.vip_intro_card_fingerprints', 'SELECT')
     OR has_table_privilege('authenticated', 'public.vip_comeback_redemptions', 'SELECT') THEN
    RAISE EXCEPTION 'post-apply assertion failed: a client role can read a ledger';
  END IF;
END $$;

COMMIT;

-- ROLLBACK (new migration file, only while both tables are empty):
-- BEGIN;
-- DROP TABLE public.vip_comeback_redemptions;
-- DROP TABLE public.vip_intro_card_fingerprints;
-- COMMIT;
