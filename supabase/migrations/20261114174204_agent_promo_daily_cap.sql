-- 20261114174204_agent_promo_daily_cap
--
-- TIER 2: one read-only helper, one settings row, and guarded patches of the
-- two agent promo doors and their allowance preview. No wallet or ledger row
-- is written by this migration.
--
-- OWNER INSTRUCTION, 2026-11-14 11:35 Central: "GO AHEAD AND FULLY BUILD, FIX
-- AND ENHANCE ALL OF THESE ... YOU DECIDE". The item: a daily cap per agent on
-- promo chips (self-sends were already refused by both doors).
--
-- Rules already in force before this migration (read from the installed
-- cores): an agent cannot send promo to itself, only to its own downline, and
-- one downline can receive at most 50 promo chips from all agents combined in
-- any 7 days. Staff (owner, co-owner, admin) are not capped. What was missing
-- is a ceiling on one agent's total: 50 chips each to an unlimited number of
-- downline accounts.
--
-- NEW RULE: an agent (super agent, agent, sub agent) may send at most
-- agent_promo_daily_chips promo chips in any 24 hours, across the promo wallet
-- door (fn_promo_wallet_send_core_20261004) and the promo ticket door
-- (fn_cashier_promo_ticket_send); both doors write the same promo_wallet_send
-- receipt, which is what is summed. Default 250, held in sp_digest_settings so
-- it changes without a migration. 250 is two and a half times the largest day
-- any agent has sent (ChiToWnBaLLn, 100 on Nov 12) and five new players at
-- the full 50-chip downline allowance. Staff stay uncapped, as before. A
-- refused send returns error_code promo_agent_daily_limit with the remaining
-- chips, in the same shape as the existing promo_downline_seven_day_limit.
-- fn_cashier_promo_allowance (the cashier's preview) now caps each member's
-- remaining_chips by the agent's own remaining day, so the cashier input
-- limits itself with no client change, and reports agent_daily.
BEGIN;

INSERT INTO public.sp_digest_settings (key, value, note)
VALUES ('agent_promo_daily_chips', 250,
        'Most promo chips one agent (super agent, agent or sub agent) may send in any 24 hours, promo wallet and promo ticket sends combined; staff are not capped')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_ca_agent_promo_daily_allowance(p_club_id uuid, p_agent uuid, p_at timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH cap AS (SELECT trim_scale(round(public.fn_sp_setting('agent_promo_daily_chips', 250), 2)) AS c),
  sent AS (
    SELECT COALESCE(sum(t.amount), 0) AS s
      FROM public.chip_transactions t
     WHERE t.club_id = p_club_id AND t.from_user_id = p_agent
       AND t.transaction_type = 'promo_wallet_send'
       AND t.metadata ->> 'actor_role' IN ('super_agent', 'agent', 'sub_agent')
       AND t.created_at > p_at - interval '24 hours')
  SELECT jsonb_build_object('limit_chips', cap.c, 'window_hours', 24,
                            'sent_last_24_hours', trim_scale(sent.s),
                            'remaining_chips', trim_scale(greatest(0::numeric, cap.c - sent.s)))
    FROM cap, sent;
$function$;

REVOKE ALL ON FUNCTION public.fn_ca_agent_promo_daily_allowance(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_ca_agent_promo_daily_allowance(uuid, uuid, timestamptz) IS
  'Agent promo cap (Dan, 2026-11-14): promo chips one agent sent in the 24 hours before p_at across both promo doors, against agent_promo_daily_chips.';

DO $patch$
DECLARE
  original text; updated text; anchor text;
BEGIN
  anchor := $a$'sent_last_7_days', v_sent, 'remaining_chips', v_remaining);
    end if;
  end if;$a$;

  -- Promo wallet door.
  original := pg_get_functiondef('public.fn_promo_wallet_send_core_20261004(uuid, uuid, numeric, text, text, uuid)'::regprocedure);
  IF (length(original) - length(replace(original, anchor, ''))) / length(anchor) <> 1 THEN
    RAISE EXCEPTION 'promo wallet door predecessor changed: downline limit anchor not found exactly once';
  END IF;
  updated := replace(original, anchor, $n$'sent_last_7_days', v_sent, 'remaining_chips', v_remaining);
    end if;
    -- One agent's own ceiling across both promo doors (Dan, 2026-11-14).
    declare
      v_agent_cap jsonb := public.fn_ca_agent_promo_daily_allowance(p_club_id, v_actor, v_limit_time);
    begin
      if p_amount > (v_agent_cap ->> 'remaining_chips')::numeric then
        return jsonb_build_object('success', false,
          'error', format('Promo Limit: An Agent Can Send Only %s Promo Chips In Any 24 Hours. %s Chips Remain.',
                          v_agent_cap ->> 'limit_chips', v_agent_cap ->> 'remaining_chips'),
          'error_code', 'promo_agent_daily_limit',
          'limit_chips', (v_agent_cap ->> 'limit_chips')::numeric, 'window_hours', 24,
          'sent_last_24_hours', (v_agent_cap ->> 'sent_last_24_hours')::numeric,
          'remaining_chips', (v_agent_cap ->> 'remaining_chips')::numeric);
      end if;
    end;
  end if;$n$);
  EXECUTE updated;

  -- Promo ticket door.
  original := pg_get_functiondef('public.fn_cashier_promo_ticket_send(uuid, uuid, numeric, text)'::regprocedure);
  IF (length(original) - length(replace(original, anchor, ''))) / length(anchor) <> 1 THEN
    RAISE EXCEPTION 'promo ticket door predecessor changed: downline limit anchor not found exactly once';
  END IF;
  updated := replace(original, anchor, $n$'sent_last_7_days', v_sent, 'remaining_chips', v_remaining);
    end if;
    -- One agent's own ceiling across both promo doors (Dan, 2026-11-14).
    declare
      v_agent_cap jsonb := public.fn_ca_agent_promo_daily_allowance(p_club_id, v_me, v_limit_time);
    begin
      if p_value > (v_agent_cap ->> 'remaining_chips')::numeric then
        return jsonb_build_object('success', false,
          'error', format('Promo Limit: An Agent Can Send Only %s Promo Chips In Any 24 Hours. %s Chips Remain.',
                          v_agent_cap ->> 'limit_chips', v_agent_cap ->> 'remaining_chips'),
          'error_code', 'promo_agent_daily_limit',
          'limit_chips', (v_agent_cap ->> 'limit_chips')::numeric, 'window_hours', 24,
          'sent_last_24_hours', (v_agent_cap ->> 'sent_last_24_hours')::numeric,
          'remaining_chips', (v_agent_cap ->> 'remaining_chips')::numeric);
      end if;
    end;
  end if;$n$);
  EXECUTE updated;

  -- Cashier preview: each member's remaining allowance also respects the
  -- agent's own remaining day, and the agent's day is reported.
  original := pg_get_functiondef('public.fn_cashier_promo_allowance(uuid, uuid[])'::regprocedure);
  updated := replace(original,
    $o$'remaining_chips', greatest(0::numeric, 50::numeric - s.sent))), '[]'::jsonb)$o$,
    $n$'remaining_chips', least(greatest(0::numeric, 50::numeric - s.sent),
             (public.fn_ca_agent_promo_daily_allowance(p_club_id, v_me, v_now) ->> 'remaining_chips')::numeric))), '[]'::jsonb)$n$);
  IF updated = original THEN RAISE EXCEPTION 'promo allowance predecessor changed: remaining_chips not found'; END IF;
  original := updated;
  updated := replace(original,
    $o$'limit_chips', 50, 'window_hours', 168, 'allowances', v_rows);$o$,
    $n$'limit_chips', 50, 'window_hours', 168, 'allowances', v_rows,
    'agent_daily', public.fn_ca_agent_promo_daily_allowance(p_club_id, v_me, v_now));$n$);
  IF updated = original THEN RAISE EXCEPTION 'promo allowance predecessor changed: capped result not found'; END IF;
  EXECUTE updated;
END $patch$;

DO $verify$
DECLARE r jsonb;
BEGIN
  IF position('promo_agent_daily_limit' IN pg_get_functiondef('public.fn_promo_wallet_send_core_20261004(uuid, uuid, numeric, text, text, uuid)'::regprocedure)) = 0
     OR position('promo_agent_daily_limit' IN pg_get_functiondef('public.fn_cashier_promo_ticket_send(uuid, uuid, numeric, text)'::regprocedure)) = 0
     OR position('agent_daily' IN pg_get_functiondef('public.fn_cashier_promo_allowance(uuid, uuid[])'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'agent promo cap is not wired into every promo door';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ca_agent_promo_daily_allowance(uuid, uuid, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ca_agent_promo_daily_allowance(uuid, uuid, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'allowance helper is executable by a client role';
  END IF;
  -- twin2983 (KINGS CLUB super agent) read against the cap.
  r := public.fn_ca_agent_promo_daily_allowance('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', '2e8073d8-ada2-4576-a879-02b9532a858e', clock_timestamp());
  IF (r ->> 'limit_chips')::numeric <> public.fn_sp_setting('agent_promo_daily_chips', 250) THEN
    RAISE EXCEPTION 'helper does not read the configured cap: %', r;
  END IF;
END $verify$;

COMMIT;
