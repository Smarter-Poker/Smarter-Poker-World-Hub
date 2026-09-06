-- ═══════════════════════════════════════════════════════════════════════
-- 20260906210000_deduct_diamonds_idempotency_binding.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3 (money-moving function replacement)
-- AUTHOR:       Codex
-- AFFECTS:      RPC public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)
-- IRREVERSIBLE: no (exact pre-migration function is in ROLLBACK below)
--
-- WHY:
-- Bind every deduct_diamonds replay to the immutable debit it is replaying.
--
-- Before this migration, the idempotency branch matched only (user_id,
-- reference_id) and echoed the NEW caller-supplied amount in a success
-- receipt. A player could therefore spend one diamond with a predictable
-- Trivia lifeline reference and replay that row as a five-diamond purchase.
-- The same primitive could substitute a different transaction destination in
-- server-to-server transfer paths. Replays now prove amount, effective type,
-- counterparty and issuance class before returning success.
--
-- HOW:
-- Serialize attempts on the profile row, compare an existing ledger row with
-- the requested debit proof, return a complete receipt only for an exact
-- replay, and retain service-role-only execution.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
DECLARE
    v_overload_count integer;
BEGIN
    SELECT count(*)
      INTO v_overload_count
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'deduct_diamonds';

    IF v_overload_count <> 1 THEN
        RAISE EXCEPTION
            'pre-flight failed: expected one deduct_diamonds overload, found %',
            v_overload_count;
    END IF;

    IF to_regprocedure(
        'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)'
    ) IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: canonical deduct_diamonds signature is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_proc AS p
         WHERE p.oid = to_regprocedure(
             'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)'
         )
           AND p.prosecdef
           AND p.prorettype = 'jsonb'::regtype
           AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: deduct_diamonds execution contract drifted';
    END IF;

    IF to_regnamespace('extensions') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: extensions schema is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'diamond_transactions'
           AND column_name IN ('amount', 'transaction_type', 'type', 'balance_after',
                               'reference_id', 'counterparty', 'issuance_class')
         GROUP BY table_schema, table_name
        HAVING count(*) = 7
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: diamond transaction proof columns are incomplete';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.diamond_transactions
         WHERE reference_id IS NOT NULL
         GROUP BY user_id, reference_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: ambiguous duplicate user/reference receipts exist';
    END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.deduct_diamonds(
    p_user_id uuid,
    p_amount integer,
    p_description text DEFAULT ''::text,
    p_transaction_type text DEFAULT 'game_cost'::text,
    p_source text DEFAULT NULL::text,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_reference_id text DEFAULT NULL::text,
    p_cooldown_seconds integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_current integer;
    v_new_balance integer;
    v_effective_type text;
    v_issuance_class text;
    v_counterparty text;
    v_existing_amount numeric;
    v_existing_type text;
    v_existing_counterparty text;
    v_existing_issuance_class text;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Amount must be a positive integer');
    END IF;
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot deduct diamonds for another user');
    END IF;

    v_effective_type := COALESCE(p_source, p_transaction_type);

    -- Derive the destination before the replay check so the same reference
    -- cannot be moved to another recipient or revenue account.
    IF COALESCE(p_source, '') IN ('wallet_transfer', 'wallet_diamond_transfer', 'stream_gift')
       OR COALESCE(p_transaction_type, '') IN ('diamond_gift_sent', 'live_gift_sent') THEN
        v_issuance_class := 'transferred';
        v_counterparty := 'player:' || COALESCE(p_metadata->>'recipient_id', 'unknown');
    ELSE
        v_issuance_class := 'spend';
        v_counterparty := 'revenue:' || COALESCE(p_source, p_transaction_type, 'unknown');
    END IF;

    -- The profile lock serializes the first attempt and every concurrent
    -- replay. A second request cannot pass an early lookup, wait for the first
    -- debit to commit, and then fall through to a duplicate insert error.
    SELECT COALESCE(diamonds, 0)
      INTO v_current
      FROM public.profiles
     WHERE id = p_user_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF p_reference_id IS NOT NULL THEN
        SELECT dt.amount,
               COALESCE(dt.transaction_type, dt.type),
               dt.counterparty,
               dt.issuance_class
          INTO v_existing_amount,
               v_existing_type,
               v_existing_counterparty,
               v_existing_issuance_class
          FROM public.diamond_transactions AS dt
         WHERE dt.reference_id = p_reference_id
           AND dt.user_id = p_user_id
         LIMIT 1;

        IF FOUND THEN
            IF v_existing_amount IS DISTINCT FROM -p_amount
               OR v_existing_type IS DISTINCT FROM v_effective_type
               OR v_existing_counterparty IS DISTINCT FROM v_counterparty
               OR v_existing_issuance_class IS DISTINCT FROM v_issuance_class THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'idempotency_conflict',
                    'balance', v_current,
                    'reference_id', p_reference_id
                );
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'balance', v_current,
                'charged', (-v_existing_amount)::integer,
                'transaction_type', v_existing_type,
                'reference_id', p_reference_id,
                'counterparty', v_existing_counterparty,
                'issuance_class', v_existing_issuance_class,
                'idempotent', true
            );
        END IF;
    END IF;

    IF v_current < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient diamonds',
            'balance', v_current
        );
    END IF;

    IF p_cooldown_seconds > 0 THEN
        IF EXISTS (
            SELECT 1
              FROM public.diamond_transactions
             WHERE user_id = p_user_id
               AND transaction_type = v_effective_type
               AND created_at >= now() - make_interval(secs => p_cooldown_seconds)
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Please wait before sending again',
                'cooldown_active', true
            );
        END IF;
    END IF;

    UPDATE public.profiles
       SET diamonds = diamonds - p_amount,
           diamond_balance = diamonds - p_amount,
           updated_at = now()
     WHERE id = p_user_id
     RETURNING diamonds INTO v_new_balance;

    INSERT INTO public.diamond_transactions
        (user_id, amount, transaction_type, type, description, balance_after, metadata,
         reference_id, created_at, counterparty, issuance_class)
    VALUES
        (p_user_id, -p_amount, v_effective_type, v_effective_type, p_description,
         v_new_balance, p_metadata, p_reference_id, now(), v_counterparty, v_issuance_class);

    RETURN jsonb_build_object(
        'success', true,
        'balance', v_new_balance,
        'charged', p_amount,
        'transaction_type', v_effective_type,
        'reference_id', p_reference_id,
        'counterparty', v_counterparty,
        'issuance_class', v_issuance_class,
        'idempotent', false
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.deduct_diamonds(
    uuid, integer, text, text, text, jsonb, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_diamonds(
    uuid, integer, text, text, text, jsonb, text, integer
) TO service_role;

DO $postcheck$
DECLARE
    v_source text;
    v_config text[];
    v_overload_count integer;
BEGIN
    SELECT p.prosrc, p.proconfig
      INTO v_source, v_config
      FROM pg_proc AS p
     WHERE p.oid = to_regprocedure(
         'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)'
     );

    SELECT count(*)
      INTO v_overload_count
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'deduct_diamonds';

    IF v_source IS NULL
       OR position('v_existing_amount IS DISTINCT FROM -p_amount' IN v_source) = 0
       OR position('v_existing_type IS DISTINCT FROM v_effective_type' IN v_source) = 0
       OR position('v_existing_counterparty IS DISTINCT FROM v_counterparty' IN v_source) = 0
       OR position('v_existing_issuance_class IS DISTINCT FROM v_issuance_class' IN v_source) = 0
       OR position('''transaction_type'', v_existing_type' IN v_source) = 0
       OR position('''reference_id'', p_reference_id' IN v_source) = 0
       OR position('diamond_balance = diamonds - p_amount' IN v_source) = 0 THEN
        RAISE EXCEPTION 'post-apply failed: deduct_diamonds replacement is incomplete';
    END IF;

    IF v_overload_count <> 1 THEN
        RAISE EXCEPTION 'post-apply failed: unexpected deduct_diamonds overload count %', v_overload_count;
    END IF;

    IF NOT COALESCE(v_config @> ARRAY['search_path=public, extensions'], false) THEN
        RAISE EXCEPTION 'post-apply failed: deduct_diamonds search_path is not fixed';
    END IF;

    IF has_function_privilege(
        'public',
        'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: PUBLIC can execute deduct_diamonds';
    END IF;
    IF has_function_privilege(
        'anon',
        'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: anon can execute deduct_diamonds';
    END IF;
    IF has_function_privilege(
        'authenticated',
        'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: authenticated can execute deduct_diamonds';
    END IF;
    IF NOT has_function_privilege(
        'service_role',
        'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: service_role lost deduct_diamonds';
    END IF;
END
$postcheck$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3: paste the SQL inside this block into a NEW migration)
-- Exact pre-migration production function captured on 2026-09-06. This
-- intentionally restores its original replay behavior and search_path, so it
-- must be paired with an application rollback that no longer trusts a bound
-- receipt. No ledger rows or balances are rewritten by this rollback.
-- ═══════════════════════════════════════════════════════════════════════
/*
BEGIN;

CREATE OR REPLACE FUNCTION public.deduct_diamonds(
    p_user_id uuid,
    p_amount integer,
    p_description text DEFAULT ''::text,
    p_transaction_type text DEFAULT 'game_cost'::text,
    p_source text DEFAULT NULL::text,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_reference_id text DEFAULT NULL::text,
    p_cooldown_seconds integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current     integer;
  v_new_balance integer;
  v_effective_type text;
  v_issuance_class text;
  v_counterparty text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be a positive integer');
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot deduct diamonds for another user');
  END IF;

  IF p_reference_id IS NOT NULL THEN
    SELECT balance_after INTO v_new_balance
      FROM diamond_transactions
     WHERE reference_id = p_reference_id AND user_id = p_user_id
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'balance', v_new_balance,
                                'charged', p_amount, 'idempotent', true);
    END IF;
  END IF;

  SELECT COALESCE(diamonds, 0) INTO v_current
    FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  IF v_current < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_current);
  END IF;

  v_effective_type := COALESCE(p_source, p_transaction_type);

  IF p_cooldown_seconds > 0 THEN
    IF EXISTS (
      SELECT 1 FROM diamond_transactions
       WHERE user_id = p_user_id
         AND transaction_type = v_effective_type
         AND created_at >= now() - make_interval(secs => p_cooldown_seconds)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Please wait before sending again',
                                'cooldown_active', true);
    END IF;
  END IF;

  -- DR3. A gift or a transfer leaves this player for another player; every
  -- other debit leaves for the revenue line of the sink that took it.
  IF COALESCE(p_source, '') IN ('wallet_transfer', 'wallet_diamond_transfer', 'stream_gift')
     OR COALESCE(p_transaction_type, '') IN ('diamond_gift_sent', 'live_gift_sent') THEN
    v_issuance_class := 'transferred';
    v_counterparty   := 'player:' || COALESCE(p_metadata->>'recipient_id', 'unknown');
  ELSE
    v_issuance_class := 'spend';
    v_counterparty   := 'revenue:' || COALESCE(p_source, p_transaction_type, 'unknown');
  END IF;

  UPDATE profiles
     SET diamonds        = diamonds - p_amount,
         diamond_balance = diamonds - p_amount,
         updated_at      = now()
   WHERE id = p_user_id
   RETURNING diamonds INTO v_new_balance;

  INSERT INTO diamond_transactions
    (user_id, amount, transaction_type, type, description, balance_after, metadata,
     reference_id, created_at, counterparty, issuance_class)
  VALUES
    (p_user_id, -p_amount, v_effective_type, v_effective_type, p_description, v_new_balance,
     p_metadata, p_reference_id, now(), v_counterparty, v_issuance_class);

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'charged', p_amount);
END;
$function$;

REVOKE ALL ON FUNCTION public.deduct_diamonds(
    uuid, integer, text, text, text, jsonb, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_diamonds(
    uuid, integer, text, text, text, jsonb, text, integer
) TO service_role;

COMMIT;
*/
