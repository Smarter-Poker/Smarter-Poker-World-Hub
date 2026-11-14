-- Native PostgreSQL 17 fixture for the 2026-11-14 promo control migrations
-- (scripts/verify-digest-player-report-postgres.mjs). Minimal tables and the
-- predecessor shape of every function those migrations patch, each holding
-- the exact text the migration anchors on. Seeded with the production rows
-- the migrations' own verify blocks read (MeepMeep's Welcome Back payment and
-- the agent sends of 2026-11-12/13 Chicago).
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS smarter_private;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

CREATE TABLE public.profiles(id uuid PRIMARY KEY, username text, alias text, display_name text, first_name text,
  last_name text, full_name text, is_horse boolean DEFAULT false);
CREATE TABLE public.unions(id uuid PRIMARY KEY, name text);
CREATE TABLE public.clubs(id uuid PRIMARY KEY, name text);
CREATE TABLE public.club_members(club_id uuid, user_id uuid, role text DEFAULT 'member', status text DEFAULT 'active');
CREATE TABLE public.chip_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid, from_user_id uuid,
  to_user_id uuid, amount numeric, transaction_type text, notes text, metadata jsonb, balance_after numeric,
  created_at timestamptz DEFAULT now());
CREATE TABLE public.chip_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(),
  category text, from_type text, from_label text, from_entity_id uuid, to_type text, to_entity_id uuid, amount numeric,
  performed_by uuid, club_id uuid);
CREATE TABLE public.sp_digest_settings(key text PRIMARY KEY, value numeric, note text);
CREATE TABLE public.sp_signup_welcome_back_awards(user_id uuid PRIMARY KEY, status text, amount numeric, op_id uuid,
  last_error text, updated_at timestamptz DEFAULT now());
CREATE TABLE public.ca_hand_facts(user_id uuid);
CREATE TABLE public.club_member_play_totals(user_id uuid, hands integer, mtt_hands integer);
CREATE TABLE smarter_private.sp_real_humans(id uuid PRIMARY KEY, username text, created_at timestamptz);

CREATE FUNCTION public.fn_sp_setting(p_key text, p_default numeric) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT value FROM public.sp_digest_settings WHERE key = p_key), p_default)
$$;
CREATE FUNCTION public.fn_sp_player_has_played(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.ca_hand_facts f WHERE f.user_id = p_user_id)
      OR EXISTS (SELECT 1 FROM public.club_member_play_totals t
                  WHERE t.user_id = p_user_id AND (COALESCE(t.hands, 0) > 0 OR COALESCE(t.mtt_hands, 0) > 0));
$$;
CREATE FUNCTION public.fn_arena_name(a text, u text, d text, f text, l text, n text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(a, u, d, f, l, n)
$$;
CREATE FUNCTION public.fn_club_bank_role(p_club_id uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT m.role FROM public.club_members m WHERE m.club_id = p_club_id AND m.user_id = auth.uid() LIMIT 1
$$;

-- The union promo door, reduced to the writes the guard and the digest read:
-- the player-wallet ledger leg first (created_at = now()), then the receipt.
CREATE FUNCTION public.fn_promo_disburse(p_source_kind text, p_source_id uuid, p_target_kind text, p_target_id uuid,
  p_amount numeric, p_note text, p_club_id uuid, p_op_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_club uuid; v_tx uuid;
BEGIN
  SELECT m.club_id INTO v_club FROM public.club_members m WHERE m.user_id = p_target_id LIMIT 1;
  IF v_club IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'That Player Is Not In Any Club Of This Union'); END IF;
  INSERT INTO public.chip_ledger(category, from_type, from_label, from_entity_id, to_type, to_entity_id, amount, performed_by, club_id)
  VALUES ('promo', 'union_wallet', 'union_wallets.promo_wallet', p_source_id, 'player_wallet', p_target_id, p_amount,
          '2d1cd6c3-5700-4af9-a271-d4863fdab20d', v_club);
  INSERT INTO public.chip_transactions(club_id, to_user_id, amount, transaction_type, notes, metadata)
  VALUES (v_club, p_target_id, p_amount, 'promo_disbursement', p_note,
          jsonb_build_object('op_id', p_op_id, 'source_kind', p_source_kind, 'source_id', p_source_id, 'target_kind', p_target_kind))
  RETURNING id INTO v_tx;
  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx, 'club_id', v_club);
END $$;

-- Predecessor shape of fn_sp_signup_welcome_back_run (Club Arena 20261107130207).
CREATE FUNCTION public.fn_sp_signup_welcome_back_run(p_limit integer DEFAULT 50, p_since date DEFAULT '2026-10-19')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_union uuid := 'fade0000-0000-0000-0000-000000000001';
  c record; v_res jsonb; v_op uuid; v_awarded jsonb := '[]'::jsonb;
  v_scanned int := 0; v_closed int := 0;
BEGIN
  UPDATE public.sp_signup_welcome_back_awards a
     SET status = 'closed', last_error = 'Played A Hand Before The Chips Were Paid', updated_at = now()
   WHERE a.status IN ('no_club', 'failed') AND public.fn_sp_player_has_played(a.user_id);
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  FOR c IN
    SELECT h.id FROM smarter_private.sp_real_humans h
     WHERE h.created_at <= now() - interval '24 hours'
       AND h.created_at >= p_since
       AND NOT public.fn_sp_player_has_played(h.id)
       AND NOT EXISTS (SELECT 1 FROM public.sp_signup_welcome_back_awards a
                        WHERE a.user_id = h.id AND a.status IN ('awarded', 'closed'))
     ORDER BY h.created_at
     LIMIT p_limit
  LOOP
    v_scanned := v_scanned + 1;
    v_op := md5('signup-welcome-back:' || c.id::text)::uuid;
    BEGIN
      v_res := public.fn_promo_disburse('union', v_union, 'player', c.id, 25,
                 'Welcome Back Chips - 25 free chips from the Midway Union for your first hand', NULL, v_op);
    EXCEPTION WHEN OTHERS THEN
      v_res := jsonb_build_object('success', false, 'error', SQLERRM);
    END;
    IF COALESCE((v_res->>'success')::boolean, false) THEN
      INSERT INTO public.sp_signup_welcome_back_awards(user_id, status, amount, op_id) VALUES (c.id, 'awarded', 25, v_op)
      ON CONFLICT (user_id) DO UPDATE SET status = 'awarded', last_error = NULL;
      v_awarded := v_awarded || jsonb_build_object('user_id', c.id);
    ELSE
      INSERT INTO public.sp_signup_welcome_back_awards(user_id, status, amount, op_id, last_error)
      VALUES (c.id, CASE WHEN v_res->>'error' ILIKE '%Not In Any Club%' THEN 'no_club' ELSE 'failed' END, 25, v_op, v_res->>'error')
      ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, last_error = EXCLUDED.last_error;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('scanned', v_scanned, 'awarded', v_awarded, 'awarded_count', jsonb_array_length(v_awarded),
    'closed_count', v_closed, 'ran_at', now());
END
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_signup_welcome_back_run(integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_sp_signup_welcome_back_run(integer, date) TO service_role;

-- Predecessor shape of the two agent promo doors and their preview.
CREATE FUNCTION public.fn_promo_wallet_send_core_20261004(p_club_id uuid, p_to_user_id uuid, p_amount numeric,
  p_destination text, p_reason text, p_op_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_limit_time timestamptz;
  v_sent numeric;
  v_remaining numeric;
  v_tx_id uuid;
begin
  v_actor_role := public.fn_club_bank_role(p_club_id);
  if p_to_user_id = v_actor then
    return jsonb_build_object('success', false, 'error', 'A Promo Wallet Cannot Send To Itself');
  end if;
  v_limit_time := clock_timestamp();
  if v_actor_role in ('super_agent', 'agent', 'sub_agent') then
    select coalesce(sum(t.amount), 0) into v_sent
      from public.chip_transactions t
     where t.club_id = p_club_id and t.to_user_id = p_to_user_id
       and t.transaction_type = 'promo_wallet_send'
       and t.metadata ->> 'actor_role' in ('super_agent', 'agent', 'sub_agent')
       and t.created_at > v_limit_time - interval '168 hours';
    v_remaining := greatest(0::numeric, 50::numeric - v_sent);
    if p_amount > v_remaining then
      return jsonb_build_object('success', false,
        'error_code', 'promo_downline_seven_day_limit',
        'sent_last_7_days', v_sent, 'remaining_chips', v_remaining);
    end if;
  end if;
  insert into public.chip_transactions(club_id, from_user_id, to_user_id, amount, transaction_type, notes, metadata, created_at)
  values (p_club_id, v_actor, p_to_user_id, p_amount, 'promo_wallet_send', p_reason,
          jsonb_build_object('op_id', p_op_id, 'actor_role', v_actor_role), v_limit_time)
  returning id into v_tx_id;
  return jsonb_build_object('success', true, 'transaction_id', v_tx_id);
end
$function$;

CREATE FUNCTION public.fn_cashier_promo_ticket_send(p_club_id uuid, p_holder_id uuid, p_value numeric, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_me uuid := auth.uid();
  v_role text;
  v_limit_time timestamptz;
  v_sent numeric;
  v_remaining numeric;
begin
  v_role := public.fn_club_bank_role(p_club_id);
  v_limit_time := clock_timestamp();
  if v_role in ('super_agent', 'agent', 'sub_agent') then
    select coalesce(sum(t.amount), 0) into v_sent
      from public.chip_transactions t
     where t.club_id = p_club_id and t.to_user_id = p_holder_id
       and t.transaction_type = 'promo_wallet_send'
       and t.metadata ->> 'actor_role' in ('super_agent', 'agent', 'sub_agent')
       and t.created_at > v_limit_time - interval '168 hours';
    v_remaining := greatest(0::numeric, 50::numeric - v_sent);
    if p_value > v_remaining then
      return jsonb_build_object('success', false,
        'error_code', 'promo_downline_seven_day_limit',
        'sent_last_7_days', v_sent, 'remaining_chips', v_remaining);
    end if;
  end if;
  insert into public.chip_transactions(club_id, from_user_id, to_user_id, amount, transaction_type, notes, metadata, created_at)
  values (p_club_id, v_me, p_holder_id, p_value, 'promo_wallet_send', 'Promo Ticket',
          jsonb_build_object('ticket_key', p_idempotency_key, 'actor_role', v_role), v_limit_time);
  return jsonb_build_object('success', true);
end
$function$;

CREATE FUNCTION public.fn_cashier_promo_allowance(p_club_id uuid, p_user_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_me    uuid := auth.uid();
  v_now   timestamptz := clock_timestamp();
  v_rows  jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', u.user_id,
           'sent_last_7_days', s.sent,
           'remaining_chips', greatest(0::numeric, 50::numeric - s.sent))), '[]'::jsonb)
    into v_rows
    from (select distinct x as user_id from unnest(p_user_ids) x where x is not null) u
    cross join lateral (
      select coalesce(sum(t.amount), 0) as sent
        from public.chip_transactions t
       where t.club_id = p_club_id and t.to_user_id = u.user_id
         and t.transaction_type = 'promo_wallet_send'
         and t.created_at > v_now - interval '168 hours') s
   where u.user_id <> v_me;
  return jsonb_build_object('success', true, 'capped', true,
    'limit_chips', 50, 'window_hours', 168, 'allowances', v_rows);
end
$function$;

-- Predecessor shape of the three cashier history feeds and the statement.
CREATE FUNCTION public.fn_cashier_history_feed(p_club_id uuid, p_scope text, p_kind text, p_from timestamptz,
  p_to timestamptz, p_person uuid, p_search text, p_before_at timestamptz, p_before_id uuid, p_limit integer)
RETURNS TABLE(id uuid, created_at timestamptz, transaction_type text, amount numeric, from_user_id uuid, to_user_id uuid,
  notes text, metadata jsonb, from_name text, to_name text, request_status text, request_created_at timestamptz, invoice_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  RETURN QUERY
    SELECT ct.id, ct.created_at, ct.transaction_type, ct.amount, ct.from_user_id, ct.to_user_id, ct.notes, ct.metadata,
           CASE WHEN pf.id IS NOT NULL
                THEN public.fn_arena_name(pf.alias, pf.username, pf.display_name, pf.first_name, pf.last_name, pf.full_name) END,
           CASE WHEN pt.id IS NOT NULL THEN public.fn_arena_name(pt.alias, pt.username, pt.display_name, pt.first_name, pt.last_name, pt.full_name) END,
           NULL::text, NULL::timestamptz, NULL::text
      FROM public.chip_transactions ct
      LEFT JOIN public.profiles pf ON pf.id = ct.from_user_id
      LEFT JOIN public.profiles pt ON pt.id = ct.to_user_id
     WHERE ct.club_id = p_club_id
     ORDER BY ct.created_at DESC, ct.id DESC LIMIT p_limit;
END
$function$;
GRANT EXECUTE ON FUNCTION public.fn_cashier_history_feed(uuid, text, text, timestamptz, timestamptz, uuid, text, timestamptz, uuid, integer) TO authenticated;

CREATE FUNCTION public.fn_cashier_history_page(p_club_id uuid, p_scope text, p_kind text, p_from timestamptz,
  p_to timestamptz, p_limit integer, p_offset integer)
RETURNS TABLE(id uuid, created_at timestamptz, transaction_type text, amount numeric, from_user_id uuid, to_user_id uuid,
  notes text, metadata jsonb, from_name text, to_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  RETURN QUERY
    SELECT ct.id, ct.created_at, ct.transaction_type, ct.amount, ct.from_user_id, ct.to_user_id, ct.notes, ct.metadata,
           CASE WHEN pf.id IS NOT NULL
                THEN public.fn_arena_name(pf.alias, pf.username, pf.display_name, pf.first_name, pf.last_name, pf.full_name) END,
           CASE WHEN pt.id IS NOT NULL THEN public.fn_arena_name(pt.alias, pt.username, pt.display_name, pt.first_name, pt.last_name, pt.full_name) END
      FROM public.chip_transactions ct
      LEFT JOIN public.profiles pf ON pf.id = ct.from_user_id
      LEFT JOIN public.profiles pt ON pt.id = ct.to_user_id
     WHERE ct.club_id = p_club_id
     ORDER BY ct.created_at DESC, ct.id DESC LIMIT p_limit OFFSET p_offset;
END
$function$;

CREATE FUNCTION public.fn_cashier_transaction_history(p_club_id uuid, p_scope text, p_limit integer, p_offset integer)
RETURNS TABLE(id uuid, created_at timestamptz, transaction_type text, amount numeric, from_user_id uuid, to_user_id uuid,
  notes text, metadata jsonb, from_name text, to_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  RETURN QUERY
    SELECT ct.id, ct.created_at, ct.transaction_type, ct.amount, ct.from_user_id, ct.to_user_id, ct.notes, ct.metadata,
           CASE WHEN pf.id IS NOT NULL
                THEN public.fn_arena_name(pf.alias, pf.username, pf.display_name, pf.first_name, pf.last_name, pf.full_name) END,
           CASE WHEN pt.id IS NOT NULL THEN public.fn_arena_name(pt.alias, pt.username, pt.display_name, pt.first_name, pt.last_name, pt.full_name) END
      FROM public.chip_transactions ct
      LEFT JOIN public.profiles pf ON pf.id = ct.from_user_id
      LEFT JOIN public.profiles pt ON pt.id = ct.to_user_id
     WHERE ct.club_id = p_club_id
     ORDER BY ct.created_at DESC, ct.id DESC LIMIT p_limit OFFSET p_offset;
END
$function$;

CREATE FUNCTION public.fn_cashier_statement_rows(p_club_id uuid, p_viewer uuid, p_scope text, p_from timestamptz,
  p_to timestamptz, p_filters jsonb, p_after_at timestamptz, p_after_source text, p_after_id uuid, p_limit integer)
RETURNS TABLE(entry_at timestamptz, entry_source text, entry_id uuid, entry_direction text, entry_amount numeric, entry jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  RETURN QUERY
  SELECT e.at, 'chip_transactions'::text, e.id, 'in'::text, e.amount,
         jsonb_build_object('from', jsonb_build_object('id', e.from_id, 'label', e.from_label),
                            'to', jsonb_build_object('id', e.to_id, 'label', e.to_label))
    FROM (
      SELECT p.*,
             CASE WHEN pf.id IS NOT NULL
                  THEN public.fn_arena_name(pf.alias, pf.username, pf.display_name, pf.first_name, pf.last_name, pf.full_name)
                  ELSE p.from_ledger_label END AS from_label,
             CASE WHEN pt.id IS NOT NULL
                  THEN public.fn_arena_name(pt.alias, pt.username, pt.display_name, pt.first_name, pt.last_name, pt.full_name)
                  ELSE p.to_ledger_label END AS to_label
        FROM (SELECT ct.created_at AS at, ct.id, ct.amount,
                     CASE WHEN ct.transaction_type = 'promo_disbursement' THEN (ct.metadata ->> 'source_id')::uuid
                          ELSE ct.from_user_id END AS from_id,
                     ct.to_user_id AS to_id, NULL::text AS from_ledger_label, NULL::text AS to_ledger_label
                FROM public.chip_transactions ct WHERE ct.club_id = p_club_id) p
        LEFT JOIN public.profiles pf ON pf.id = p.from_id
        LEFT JOIN public.profiles pt ON pt.id = p.to_id
    ) e
   ORDER BY e.at DESC
   LIMIT p_limit;
END
$function$;

-- Production identities the migrations' verify blocks name.
INSERT INTO public.unions VALUES ('fade0000-0000-0000-0000-000000000001', 'Midway Union');
INSERT INTO public.clubs VALUES ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', 'KINGS CLUB'), ('fade0000-0000-0000-0000-000000000001', 'Midway Union');
INSERT INTO public.profiles(id, username) VALUES
  ('3752e8b6-d7d4-4fc2-a68f-15c634b7d02e', 'MeepMeep'),
  ('2e8073d8-ada2-4576-a879-02b9532a858e', 'twin2983'),
  ('a9299039-e557-4e3b-802a-3b790a179ea7', 'ChiToWnBaLLn'),
  ('e2585d99-e4c3-45b9-86e8-e40620f60cb0', 'Kewski'),
  ('2d1cd6c3-5700-4af9-a271-d4863fdab20d', 'smarterpoker');
INSERT INTO public.club_members(club_id, user_id, role) VALUES
  ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', '3752e8b6-d7d4-4fc2-a68f-15c634b7d02e', 'member'),
  ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', '2e8073d8-ada2-4576-a879-02b9532a858e', 'super_agent'),
  ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', 'a9299039-e557-4e3b-802a-3b790a179ea7', 'super_agent'),
  ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', 'e2585d99-e4c3-45b9-86e8-e40620f60cb0', 'member');

-- twin2983 -> MeepMeep 50 (Nov 12 11:02 PM Chicago), ChiToWnBaLLn -> Kewski 50
-- (Nov 13 6:33 PM), then the Midway Union's Welcome Back 25 to MeepMeep
-- (Nov 13 7:17 PM), all as the production ledger recorded them.
INSERT INTO public.chip_transactions(id, club_id, from_user_id, to_user_id, amount, transaction_type, notes, metadata, created_at) VALUES
  ('54572dd1-8aa0-403d-9dfc-2dd08433ab43', 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4', '2e8073d8-ada2-4576-a879-02b9532a858e',
   '3752e8b6-d7d4-4fc2-a68f-15c634b7d02e', 50, 'promo_wallet_send', 'Cashier Send Out', '{"actor_role":"super_agent"}', '2026-11-13 05:02:09.174525+00'),
  (gen_random_uuid(), 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4', 'a9299039-e557-4e3b-802a-3b790a179ea7',
   'e2585d99-e4c3-45b9-86e8-e40620f60cb0', 50, 'promo_wallet_send', 'Cashier Send Out', '{"actor_role":"super_agent"}', '2026-11-14 00:33:04.361743+00'),
  ('07ddbdc4-701f-47cb-9fd4-7d89b9c62a91', 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4', NULL,
   '3752e8b6-d7d4-4fc2-a68f-15c634b7d02e', 25, 'promo_disbursement',
   'Welcome Back Chips - 25 free chips from the Midway Union for your first hand',
   jsonb_build_object('op_id', md5('signup-welcome-back:3752e8b6-d7d4-4fc2-a68f-15c634b7d02e')::uuid, 'source_kind', 'union',
                      'source_id', 'fade0000-0000-0000-0000-000000000001', 'target_kind', 'player'),
   '2026-11-14 01:17:00.546227+00');
INSERT INTO public.chip_ledger(created_at, category, from_type, from_label, from_entity_id, to_type, to_entity_id, amount, performed_by, club_id) VALUES
  ('2026-11-13 05:02:09.157179+00', 'promo_send', 'promo_wallet', NULL, '2e8073d8-ada2-4576-a879-02b9532a858e', 'player_wallet',
   '3752e8b6-d7d4-4fc2-a68f-15c634b7d02e', 50, '2e8073d8-ada2-4576-a879-02b9532a858e', 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4'),
  ('2026-11-14 00:33:04.345143+00', 'promo_send', 'promo_wallet', NULL, 'a9299039-e557-4e3b-802a-3b790a179ea7', 'player_wallet',
   'e2585d99-e4c3-45b9-86e8-e40620f60cb0', 50, 'a9299039-e557-4e3b-802a-3b790a179ea7', 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4'),
  ('2026-11-14 01:17:00.546227+00', 'promo', 'union_wallet', 'union_wallets.promo_wallet', 'fade0000-0000-0000-0000-000000000001',
   'player_wallet', '3752e8b6-d7d4-4fc2-a68f-15c634b7d02e', 25, '2d1cd6c3-5700-4af9-a271-d4863fdab20d', 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4');
INSERT INTO public.sp_signup_welcome_back_awards(user_id, status, amount, op_id) VALUES
  ('3752e8b6-d7d4-4fc2-a68f-15c634b7d02e', 'awarded', 25, md5('signup-welcome-back:3752e8b6-d7d4-4fc2-a68f-15c634b7d02e')::uuid);
