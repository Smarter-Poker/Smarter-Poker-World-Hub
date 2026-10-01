-- Lifetime VIP monthly promotional Diamond lots.
-- TIER: 3 (wallet issuance, spend allocation, and retirement)
-- AFFECTS: profiles, diamond_transactions, The Mint, vip-stipend cron RPCs.
-- CONTRACT: 2,000 promotional Diamonds per eligible Lifetime member per
-- Chicago calendar month. Each lot expires 90 days after issue. Spending uses
-- the oldest unexpired promotional lot before permanent Diamonds.
--
-- This migration deliberately does not replace either global wallet debit
-- function. One AFTER INSERT trigger on the canonical Diamond journal retires
-- overdue lots before accepting a debit, then allocates that debit FIFO. If
-- the post-debit wallet cannot still fund the overdue retirement, the Mint
-- refuses and the entire outer debit transaction rolls back.

BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure(
    'public.fn_ca_mint(text,text,uuid,numeric,text,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: seven-argument fn_ca_mint is missing';
  END IF;
  IF to_regprocedure(
    'public.fn_ca_burn(text,text,uuid,numeric,text,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: seven-argument fn_ca_burn is missing';
  END IF;
  IF to_regclass('public.diamond_transactions') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: diamond_transactions is missing';
  END IF;
END
$preflight$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lifetime_vip_since timestamptz;

UPDATE public.profiles
   SET lifetime_vip_since = COALESCE(created_at, updated_at, now())
 WHERE vip_tier = 'lifetime'
   AND COALESCE(is_vip, false)
   AND lifetime_vip_since IS NULL;

CREATE OR REPLACE FUNCTION public.track_lifetime_vip_since()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF COALESCE(NEW.is_vip, false) AND NEW.vip_tier = 'lifetime' THEN
    IF NOT COALESCE(OLD.is_vip, false)
       OR OLD.vip_tier IS DISTINCT FROM 'lifetime'
       OR NEW.lifetime_vip_since IS NULL THEN
      NEW.lifetime_vip_since := COALESCE(NEW.lifetime_vip_since, now());
    END IF;
  ELSIF COALESCE(OLD.is_vip, false) AND OLD.vip_tier = 'lifetime' THEN
    NEW.lifetime_vip_since := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_track_lifetime_vip_since ON public.profiles;
CREATE TRIGGER trg_track_lifetime_vip_since
  BEFORE UPDATE OF is_vip, vip_tier, lifetime_vip_since
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.track_lifetime_vip_since();

CREATE TABLE public.lifetime_vip_diamond_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  grant_month date NOT NULL,
  granted_amount integer NOT NULL DEFAULT 2000 CHECK (granted_amount = 2000),
  remaining_amount integer NOT NULL DEFAULT 2000 CHECK (remaining_amount BETWEEN 0 AND 2000),
  consumed_amount integer NOT NULL DEFAULT 0 CHECK (consumed_amount BETWEEN 0 AND 2000),
  expired_amount integer NOT NULL DEFAULT 0 CHECK (expired_amount BETWEEN 0 AND 2000),
  status text NOT NULL DEFAULT 'issuing'
    CHECK (status IN ('issuing', 'active', 'exhausted', 'expired')),
  issued_at timestamptz,
  expires_at timestamptz,
  mint_op_id text NOT NULL,
  mint_transaction_id uuid REFERENCES public.diamond_transactions(id) ON DELETE RESTRICT,
  expiry_transaction_id uuid REFERENCES public.diamond_transactions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, grant_month),
  UNIQUE (mint_op_id),
  CHECK (grant_month = date_trunc('month', grant_month::timestamp)::date),
  CHECK (consumed_amount + expired_amount + remaining_amount = granted_amount),
  CHECK (
    (status = 'issuing' AND issued_at IS NULL AND expires_at IS NULL)
    OR (status <> 'issuing' AND issued_at IS NOT NULL AND expires_at = issued_at + interval '90 days')
  )
);

CREATE INDEX lifetime_vip_diamond_lots_expiry_idx
  ON public.lifetime_vip_diamond_lots(expires_at, user_id)
  WHERE remaining_amount > 0;

ALTER TABLE public.lifetime_vip_diamond_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY lifetime_vip_diamond_lots_owner_read
  ON public.lifetime_vip_diamond_lots
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.lifetime_vip_diamond_lots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lifetime_vip_diamond_lots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lifetime_vip_diamond_lots TO service_role;

CREATE TABLE public.lifetime_vip_diamond_lot_allocations (
  transaction_id uuid NOT NULL REFERENCES public.diamond_transactions(id) ON DELETE RESTRICT,
  lot_id uuid NOT NULL REFERENCES public.lifetime_vip_diamond_lots(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_id, lot_id)
);

ALTER TABLE public.lifetime_vip_diamond_lot_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY lifetime_vip_diamond_lot_allocations_owner_read
  ON public.lifetime_vip_diamond_lot_allocations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.lifetime_vip_diamond_lot_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lifetime_vip_diamond_lot_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lifetime_vip_diamond_lot_allocations TO service_role;

CREATE OR REPLACE FUNCTION public.expire_lifetime_vip_diamond_lots_for_user(
  p_user_id uuid,
  p_as_of timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_lot public.lifetime_vip_diamond_lots%ROWTYPE;
  v_burn_result jsonb;
  v_tx uuid;
  v_expired integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_as_of IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
  END IF;

  -- The profile lock serializes expiry against every canonical wallet writer.
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  FOR v_lot IN
    SELECT *
      FROM public.lifetime_vip_diamond_lots
     WHERE user_id = p_user_id
       AND status = 'active'
       AND remaining_amount > 0
       AND expires_at <= p_as_of
     ORDER BY expires_at, issued_at, id
     FOR UPDATE
  LOOP
    v_burn_result := public.fn_ca_burn(
      'diamonds',
      'player',
      p_user_id,
      v_lot.remaining_amount,
      'Expired Lifetime VIP Monthly Diamonds',
      'lifetime-vip-expiry:' || v_lot.id::text,
      'promotional'
    );
    IF COALESCE((v_burn_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Lifetime VIP Diamond expiry burn refused: %',
        COALESCE(v_burn_result ->> 'reason', 'unknown_error');
    END IF;

    SELECT id INTO v_tx
      FROM public.diamond_transactions
     WHERE user_id = p_user_id
       AND reference_id = 'lifetime-vip-expiry:' || v_lot.id::text
     LIMIT 1;
    IF v_tx IS NULL THEN
      RAISE EXCEPTION 'Lifetime VIP Diamond expiry has no journal receipt';
    END IF;

    UPDATE public.lifetime_vip_diamond_lots
       SET expired_amount = expired_amount + remaining_amount,
           remaining_amount = 0,
           status = 'expired',
           expiry_transaction_id = v_tx,
           updated_at = now()
     WHERE id = v_lot.id;
    v_expired := v_expired + v_lot.remaining_amount;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'expired', v_expired
  );
END;
$function$;

-- Every negative journal row first retires overdue value. If that retirement
-- cannot be funded after the attempted debit, raising here rolls the debit and
-- its journal row back together. Only then is the debit allocated FIFO across
-- unexpired promotional lots.
CREATE OR REPLACE FUNCTION public.allocate_lifetime_vip_diamond_spend()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_left integer;
  v_take integer;
  v_lot public.lifetime_vip_diamond_lots%ROWTYPE;
  v_expiry jsonb;
BEGIN
  IF NEW.amount >= 0
     OR NEW.user_id IS NULL
     OR COALESCE(NEW.reference_id, '') LIKE 'lifetime-vip-expiry:%'
  THEN
    RETURN NEW;
  END IF;

  v_expiry := public.expire_lifetime_vip_diamond_lots_for_user(
    NEW.user_id,
    COALESCE(NEW.created_at, now())
  );
  IF COALESCE((v_expiry ->> 'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Lifetime VIP Diamond expiry failed before spend allocation: %',
      COALESCE(v_expiry ->> 'error', 'unknown_error');
  END IF;

  v_left := (-NEW.amount)::integer;
  FOR v_lot IN
    SELECT *
      FROM public.lifetime_vip_diamond_lots
     WHERE user_id = NEW.user_id
       AND status = 'active'
       AND remaining_amount > 0
       AND expires_at > COALESCE(NEW.created_at, now())
     ORDER BY expires_at, issued_at, id
     FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, v_lot.remaining_amount);
    INSERT INTO public.lifetime_vip_diamond_lot_allocations(
      transaction_id, lot_id, user_id, amount
    ) VALUES (NEW.id, v_lot.id, NEW.user_id, v_take);
    UPDATE public.lifetime_vip_diamond_lots
       SET remaining_amount = remaining_amount - v_take,
           consumed_amount = consumed_amount + v_take,
           status = CASE WHEN remaining_amount - v_take = 0 THEN 'exhausted' ELSE status END,
           updated_at = now()
     WHERE id = v_lot.id;
    v_left := v_left - v_take;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_allocate_lifetime_vip_diamond_spend
  AFTER INSERT ON public.diamond_transactions
  FOR EACH ROW
  WHEN (NEW.amount < 0)
  EXECUTE FUNCTION public.allocate_lifetime_vip_diamond_spend();

CREATE OR REPLACE FUNCTION public.expire_lifetime_vip_diamond_lots(
  p_limit integer DEFAULT 1000,
  p_as_of timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user uuid;
  v_result jsonb;
  v_users integer := 0;
  v_expired integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_role_required');
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 OR p_as_of IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
  END IF;

  FOR v_user IN
    SELECT user_id
      FROM public.lifetime_vip_diamond_lots
     WHERE status = 'active'
       AND remaining_amount > 0
       AND expires_at <= p_as_of
     GROUP BY user_id
     ORDER BY min(expires_at), user_id
     LIMIT p_limit
  LOOP
    v_result := public.expire_lifetime_vip_diamond_lots_for_user(v_user, p_as_of);
    IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Lifetime VIP Diamond expiry failed for %: %',
        v_user, COALESCE(v_result ->> 'error', 'unknown_error');
    END IF;
    v_users := v_users + 1;
    v_expired := v_expired + COALESCE((v_result ->> 'expired')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'users', v_users,
    'expired', v_expired
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_lifetime_vip_monthly_diamonds(
  p_user_id uuid,
  p_grant_month date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_lot public.lifetime_vip_diamond_lots%ROWTYPE;
  v_now timestamptz := now();
  v_current_month date := date_trunc(
    'month', v_now AT TIME ZONE 'America/Chicago'
  )::date;
  v_op_id text;
  v_mint jsonb;
  v_tx uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_role_required');
  END IF;
  IF p_user_id IS NULL
     OR p_grant_month IS NULL
     OR p_grant_month <> date_trunc('month', p_grant_month::timestamp)::date
     OR p_grant_month <> v_current_month THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_grant_month');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('lifetime-vip-monthly:' || p_user_id::text || ':' || p_grant_month::text, 0)
  );
  SELECT * INTO v_lot
    FROM public.lifetime_vip_diamond_lots
   WHERE user_id = p_user_id
     AND grant_month = p_grant_month;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'lot_id', v_lot.id,
      'amount', v_lot.granted_amount,
      'remaining', v_lot.remaining_amount,
      'expires_at', v_lot.expires_at
    );
  END IF;

  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;
  IF COALESCE(v_profile.is_vip, false) IS NOT TRUE
     OR v_profile.vip_tier IS DISTINCT FROM 'lifetime'
     OR v_profile.lifetime_vip_since IS NULL
     OR v_profile.lifetime_vip_since >
       (p_grant_month::timestamp AT TIME ZONE 'America/Chicago') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;

  v_op_id := 'lifetime-vip-monthly:' || p_user_id::text || ':' || to_char(p_grant_month, 'YYYY-MM');
  INSERT INTO public.lifetime_vip_diamond_lots(user_id, grant_month, mint_op_id)
  VALUES (p_user_id, p_grant_month, v_op_id)
  RETURNING * INTO v_lot;

  v_mint := public.fn_ca_mint(
    'diamonds', 'player', p_user_id, 2000,
    'Lifetime VIP Monthly Diamond Benefit', v_op_id, 'promotional'
  );
  IF COALESCE((v_mint ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Lifetime VIP monthly Diamond mint refused: %',
      COALESCE(v_mint ->> 'reason', 'unknown_error');
  END IF;

  SELECT id INTO v_tx
    FROM public.diamond_transactions
   WHERE user_id = p_user_id
     AND reference_id = v_op_id
   LIMIT 1;
  IF v_tx IS NULL THEN
    RAISE EXCEPTION 'Lifetime VIP monthly Diamond mint has no journal receipt';
  END IF;

  UPDATE public.lifetime_vip_diamond_lots
     SET status = 'active',
         issued_at = v_now,
         expires_at = v_now + interval '90 days',
         mint_transaction_id = v_tx,
         updated_at = v_now
   WHERE id = v_lot.id
   RETURNING * INTO v_lot;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'lot_id', v_lot.id,
    'amount', 2000,
    'remaining', 2000,
    'expires_at', v_lot.expires_at,
    'balance_after', v_mint -> 'balance_after'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.track_lifetime_vip_since() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.allocate_lifetime_vip_diamond_spend() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_lifetime_vip_diamond_lots_for_user(uuid,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_lifetime_vip_diamond_lots(integer,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_lifetime_vip_monthly_diamonds(uuid,date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_lifetime_vip_diamond_lots(integer,timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_lifetime_vip_monthly_diamonds(uuid,date)
  TO service_role;

DO $postcheck$
DECLARE
  v_trigger_function text;
  v_grant text;
BEGIN
  SELECT prosrc INTO v_trigger_function FROM pg_proc
   WHERE oid = to_regprocedure('public.allocate_lifetime_vip_diamond_spend()');
  SELECT prosrc INTO v_grant FROM pg_proc
   WHERE oid = to_regprocedure('public.grant_lifetime_vip_monthly_diamonds(uuid,date)');

  IF v_trigger_function IS NULL
     OR position('expire_lifetime_vip_diamond_lots_for_user' IN v_trigger_function) = 0
     OR position('lifetime_vip_diamond_lot_allocations' IN v_trigger_function) = 0 THEN
    RAISE EXCEPTION 'post-apply failed: Lifetime VIP FIFO allocation is incomplete';
  END IF;
  IF v_grant IS NULL
     OR position('Lifetime VIP Monthly Diamond Benefit' IN v_grant) = 0
     OR position('interval ''90 days''' IN v_grant) = 0 THEN
    RAISE EXCEPTION 'post-apply failed: Lifetime VIP grant contract is incomplete';
  END IF;
  IF has_function_privilege(
       'authenticated', 'public.grant_lifetime_vip_monthly_diamonds(uuid,date)', 'EXECUTE'
     )
     OR has_function_privilege(
       'anon', 'public.grant_lifetime_vip_monthly_diamonds(uuid,date)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'post-apply failed: Lifetime VIP grant is client-executable';
  END IF;
END
$postcheck$;

COMMIT;

-- ROLLBACK (apply in a new Tier 3 migration after draining active callers):
/*
BEGIN;
DROP TRIGGER IF EXISTS trg_allocate_lifetime_vip_diamond_spend ON public.diamond_transactions;
DROP FUNCTION IF EXISTS public.allocate_lifetime_vip_diamond_spend();
DROP FUNCTION IF EXISTS public.grant_lifetime_vip_monthly_diamonds(uuid,date);
DROP FUNCTION IF EXISTS public.expire_lifetime_vip_diamond_lots(integer,timestamptz);
DROP FUNCTION IF EXISTS public.expire_lifetime_vip_diamond_lots_for_user(uuid,timestamptz);
DROP TABLE IF EXISTS public.lifetime_vip_diamond_lot_allocations;
DROP TABLE IF EXISTS public.lifetime_vip_diamond_lots;
DROP TRIGGER IF EXISTS trg_track_lifetime_vip_since ON public.profiles;
DROP FUNCTION IF EXISTS public.track_lifetime_vip_since();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS lifetime_vip_since;
COMMIT;
*/
