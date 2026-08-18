-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-17 via mcp apply_migration
-- (version 20260817235234, name time_bank_allowance_and_consumption)
-- Mirror of the applied migration. Do not re-run against production.
-- Engine consumer: CA 2bb23eb43 (server/src/engine — VIP time bank wiring).
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- VIP TIME BANKS: the quota existed in three disconnected pieces.
--
-- The engine hands EVERY player 1800s (120 uses) of time bank per table
-- session, in memory, VIP or not (TimeBankEngine DEFAULT_CONFIG + the
-- `time_bank_max_uses ?? 120` table default). The client displays a VIP
-- quota of 120 seconds/month (VIP_GOLD_LIMITS) read from
-- vip_feature_usage_monthly — which nothing in the activation path writes.
-- Diamond purchases land in feature_purchases ('time_bank_seconds',
-- per_use) — which nothing reads. Net: the VIP perk is meaningless
-- (everyone gets 60x the non-VIP base), the monthly ledger never moves,
-- and purchased extensions are burned diamonds.
--
-- This migration gives the ENGINE (service_role) two RPCs:
--   fn_time_bank_allowance(uuid[]) — batch read at hand init:
--     base 30s/session is engine-local; this returns the EXTRA seconds:
--     VIP monthly remaining (120s/month, unit = SECONDS in
--     vip_feature_usage_monthly.usage_count for feature
--     'time_bank_seconds') + purchased uses × 15s.
--   fn_consume_time_bank(uuid, int) — consume seconds VIP-monthly-first,
--     then purchased uses (FIFO, ceil(sec/15)); reports any shortfall
--     rather than failing mid-hand. Advisory-locked per user (concurrent
--     multi-table sessions).
--
-- Unit note: usage_count for feature 'time_bank_seconds' is SECONDS.
-- Nothing wrote this feature's row before today, so the unit is being
-- DEFINED here, matching the client's used/limit=120 display math.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_time_bank_allowance(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, is_vip boolean, vip_seconds_remaining integer,
               purchased_seconds integer, extra_seconds integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH vip AS (
    SELECT p.id,
           (COALESCE(p.is_vip, false)
             AND (p.vip_expires_at IS NULL OR p.vip_expires_at > now())) AS is_vip
    FROM profiles p WHERE p.id = ANY(p_user_ids)
  ), monthly AS (
    SELECT m.user_id AS uid, COALESCE(SUM(m.usage_count),0)::int AS used
    FROM vip_feature_usage_monthly m
    WHERE m.user_id = ANY(p_user_ids)
      AND m.feature = 'time_bank_seconds'
      AND m.month = to_char(now() AT TIME ZONE 'UTC','YYYY-MM')
    GROUP BY 1
  ), bought AS (
    SELECT fp.user_id AS uid, COALESCE(SUM(fp.uses_remaining),0)::int * 15 AS secs
    FROM feature_purchases fp
    WHERE fp.user_id = ANY(p_user_ids)
      AND fp.feature = 'time_bank_seconds'
      AND COALESCE(fp.uses_remaining,0) > 0
      AND (fp.expires_at IS NULL OR fp.expires_at > now())
    GROUP BY 1
  )
  SELECT v.id,
         v.is_vip,
         CASE WHEN v.is_vip THEN GREATEST(0, 120 - COALESCE(m.used,0)) ELSE 0 END,
         COALESCE(b.secs,0),
         CASE WHEN v.is_vip THEN GREATEST(0, 120 - COALESCE(m.used,0)) ELSE 0 END
           + COALESCE(b.secs,0)
  FROM vip v
  LEFT JOIN monthly m ON m.uid = v.id
  LEFT JOIN bought  b ON b.uid = v.id;
$function$;

REVOKE ALL ON FUNCTION public.fn_time_bank_allowance(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_time_bank_allowance(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_consume_time_bank(p_user_id uuid, p_seconds integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_vip boolean;
  v_month text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
  v_used int;
  v_from_vip int := 0;
  v_remaining int;
  v_uses_needed int;
  v_uses_taken int := 0;
  v_row record;
  v_take int;
BEGIN
  -- Engine-only writer. auth.role() is 'service_role' when called with the
  -- service key; migrations/admin run with no claims (NULL) and are allowed.
  IF COALESCE(auth.role(),'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'fn_consume_time_bank is engine-only';
  END IF;
  IF p_seconds IS NULL OR p_seconds <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_seconds must be positive');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('time_bank:' || p_user_id::text, 0));

  SELECT (COALESCE(p.is_vip,false) AND (p.vip_expires_at IS NULL OR p.vip_expires_at > now()))
    INTO v_is_vip FROM profiles p WHERE p.id = p_user_id;
  IF v_is_vip IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unknown user');
  END IF;

  v_remaining := p_seconds;

  -- 1) VIP monthly pool first (unit: seconds, cap 120/month)
  IF v_is_vip THEN
    SELECT COALESCE(SUM(usage_count),0)::int INTO v_used
    FROM vip_feature_usage_monthly
    WHERE user_id = p_user_id AND feature = 'time_bank_seconds' AND month = v_month;

    v_from_vip := LEAST(v_remaining, GREATEST(0, 120 - v_used));
    IF v_from_vip > 0 THEN
      INSERT INTO vip_feature_usage_monthly (user_id, feature, month, usage_count, updated_at)
      VALUES (p_user_id, 'time_bank_seconds', v_month, v_from_vip, now())
      ON CONFLICT (user_id, feature, month) DO UPDATE
         SET usage_count = vip_feature_usage_monthly.usage_count + EXCLUDED.usage_count,
             updated_at = now();
      v_remaining := v_remaining - v_from_vip;
    END IF;
  END IF;

  -- 2) Purchased extensions next (FIFO, 15s per use)
  IF v_remaining > 0 THEN
    v_uses_needed := CEIL(v_remaining / 15.0)::int;
    FOR v_row IN
      SELECT id, uses_remaining FROM feature_purchases
      WHERE user_id = p_user_id AND feature = 'time_bank_seconds'
        AND COALESCE(uses_remaining,0) > 0
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY created_at
      FOR UPDATE
    LOOP
      EXIT WHEN v_uses_needed <= 0;
      v_take := LEAST(v_row.uses_remaining, v_uses_needed);
      UPDATE feature_purchases SET uses_remaining = uses_remaining - v_take
       WHERE id = v_row.id;
      v_uses_taken := v_uses_taken + v_take;
      v_uses_needed := v_uses_needed - v_take;
    END LOOP;
    v_remaining := GREATEST(0, v_remaining - v_uses_taken * 15);
  END IF;

  -- Shortfall = the engine's session base (30s) or a stale in-memory bank;
  -- report it, never fail an in-flight hand over accounting.
  RETURN jsonb_build_object(
    'success', true,
    'consumed_vip_seconds', v_from_vip,
    'consumed_purchased_uses', v_uses_taken,
    'shortfall_seconds', v_remaining
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_consume_time_bank(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_consume_time_bank(uuid, integer) TO service_role;

-- ── Probes (state restored before commit) ─────────────────────────────────
DO $probe$
DECLARE
  v_user uuid;
  v_prev_vip boolean; v_prev_exp timestamptz;
  v_prev_monthly int;
  v_a record; v_c jsonb; v_pid uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at DESC LIMIT 1;
  IF v_user IS NULL THEN RAISE NOTICE 'no users; skipping probes'; RETURN; END IF;

  SELECT is_vip, vip_expires_at INTO v_prev_vip, v_prev_exp FROM profiles WHERE id = v_user;
  SELECT usage_count INTO v_prev_monthly FROM vip_feature_usage_monthly
   WHERE user_id = v_user AND feature='time_bank_seconds'
     AND month = to_char(now() AT TIME ZONE 'UTC','YYYY-MM');

  -- Make the user VIP with a clean month
  UPDATE profiles SET is_vip = true, vip_expires_at = now() + interval '1 day' WHERE id = v_user;
  DELETE FROM vip_feature_usage_monthly
   WHERE user_id = v_user AND feature='time_bank_seconds'
     AND month = to_char(now() AT TIME ZONE 'UTC','YYYY-MM');

  SELECT * INTO v_a FROM fn_time_bank_allowance(ARRAY[v_user]);
  IF NOT v_a.is_vip OR v_a.vip_seconds_remaining <> 120 THEN
    RAISE EXCEPTION 'allowance probe 1: expected vip 120, got % (vip=%)', v_a.vip_seconds_remaining, v_a.is_vip;
  END IF;

  v_c := fn_consume_time_bank(v_user, 45);
  IF (v_c->>'consumed_vip_seconds')::int <> 45 OR (v_c->>'shortfall_seconds')::int <> 0 THEN
    RAISE EXCEPTION 'consume probe: %', v_c;
  END IF;

  SELECT * INTO v_a FROM fn_time_bank_allowance(ARRAY[v_user]);
  IF v_a.vip_seconds_remaining <> 75 THEN
    RAISE EXCEPTION 'allowance probe 2: expected 75, got %', v_a.vip_seconds_remaining;
  END IF;

  -- Add a purchased extension, overdraw VIP: 75 vip + 1 use (15s) then shortfall
  INSERT INTO feature_purchases (user_id, feature, cost, usage_type, uses_remaining)
  VALUES (v_user, 'time_bank_seconds', 0, 'per_use', 1) RETURNING id INTO v_pid;

  v_c := fn_consume_time_bank(v_user, 120);
  IF (v_c->>'consumed_vip_seconds')::int <> 75
     OR (v_c->>'consumed_purchased_uses')::int <> 1
     OR (v_c->>'shortfall_seconds')::int <> 30 THEN
    RAISE EXCEPTION 'overdraw probe: %', v_c;
  END IF;

  -- Non-VIP path: extra = purchased only (now 0 after consumption)
  UPDATE profiles SET is_vip = false WHERE id = v_user;
  SELECT * INTO v_a FROM fn_time_bank_allowance(ARRAY[v_user]);
  IF v_a.is_vip OR v_a.extra_seconds <> 0 THEN
    RAISE EXCEPTION 'non-vip probe: extra=% vip=%', v_a.extra_seconds, v_a.is_vip;
  END IF;

  -- Restore state
  DELETE FROM feature_purchases WHERE id = v_pid;
  DELETE FROM vip_feature_usage_monthly
   WHERE user_id = v_user AND feature='time_bank_seconds'
     AND month = to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
  IF v_prev_monthly IS NOT NULL THEN
    INSERT INTO vip_feature_usage_monthly (user_id, feature, month, usage_count, updated_at)
    VALUES (v_user, 'time_bank_seconds', to_char(now() AT TIME ZONE 'UTC','YYYY-MM'), v_prev_monthly, now());
  END IF;
  UPDATE profiles SET is_vip = v_prev_vip, vip_expires_at = v_prev_exp WHERE id = v_user;

  RAISE NOTICE 'time bank probes passed: vip-first consumption, purchase FIFO, shortfall reporting';
END
$probe$;
