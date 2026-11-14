-- Behaviour of the 2026-11-14 promo control migrations, run after all six are
-- installed on __tests__/promo-controls.sql.
\set ON_ERROR_STOP 1

-- Sign-ups for the Welcome Back run: one never funded (paid), one funded by
-- an agent (skipped), one parked without a club who has since received chips
-- (closed, never paid), and one who already played (skipped as before).
INSERT INTO public.profiles(id, username) VALUES
  ('10000000-0000-0000-0000-0000000000f1', 'FreshPlayer'),
  ('10000000-0000-0000-0000-0000000000f2', 'ParkedPlayer'),
  ('10000000-0000-0000-0000-0000000000f3', 'PlayedPlayer');
INSERT INTO public.club_members(club_id, user_id) VALUES
  ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', '10000000-0000-0000-0000-0000000000f1'),
  ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', '10000000-0000-0000-0000-0000000000f3');
INSERT INTO smarter_private.sp_real_humans(id, username, created_at) VALUES
  ('10000000-0000-0000-0000-0000000000f1', 'FreshPlayer', now() - interval '3 days'),
  ('e2585d99-e4c3-45b9-86e8-e40620f60cb0', 'Kewski', now() - interval '2 days'),
  ('10000000-0000-0000-0000-0000000000f2', 'ParkedPlayer', now() - interval '3 days'),
  ('10000000-0000-0000-0000-0000000000f3', 'PlayedPlayer', now() - interval '3 days'),
  ('3752e8b6-d7d4-4fc2-a68f-15c634b7d02e', 'MeepMeep', now() - interval '2 days');
INSERT INTO public.sp_signup_welcome_back_awards(user_id, status, amount, last_error)
  VALUES ('10000000-0000-0000-0000-0000000000f2', 'no_club', 25, 'That Player Is Not In Any Club Of This Union');
INSERT INTO public.chip_transactions(club_id, from_user_id, to_user_id, amount, transaction_type, notes, metadata, created_at)
  VALUES ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', '2e8073d8-ada2-4576-a879-02b9532a858e', '10000000-0000-0000-0000-0000000000f2',
          10, 'promo_wallet_send', 'Cashier Send Out', '{"actor_role":"super_agent"}', now() - interval '3 hours');
INSERT INTO public.club_member_play_totals VALUES ('10000000-0000-0000-0000-0000000000f3', 4, 0);

DO $$
DECLARE r jsonb;
BEGIN
  r := public.fn_sp_signup_welcome_back_run(50, '2026-10-19');
  IF (r ->> 'awarded_count')::int <> 1 OR r -> 'awarded' -> 0 ->> 'user_id' <> '10000000-0000-0000-0000-0000000000f1' THEN
    RAISE EXCEPTION 'only the never-funded sign-up may be paid: %', r;
  END IF;
  IF (r ->> 'closed_received_chips_count')::int <> 1 THEN
    RAISE EXCEPTION 'the parked sign-up who received chips was not closed: %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_signup_welcome_back_awards WHERE user_id = 'e2585d99-e4c3-45b9-86e8-e40620f60cb0') THEN
    RAISE EXCEPTION 'Kewski, already sent chips by an agent, was touched by the run';
  END IF;
  IF (SELECT status || '|' || last_error FROM public.sp_signup_welcome_back_awards WHERE user_id = '10000000-0000-0000-0000-0000000000f2')
     <> 'closed|Already Received Chips Before Welcome Back' THEN
    RAISE EXCEPTION 'parked row not closed with its reason';
  END IF;
  IF (SELECT count(*) FROM public.chip_transactions WHERE transaction_type = 'promo_disbursement'
        AND to_user_id = '10000000-0000-0000-0000-0000000000f1') <> 1 THEN
    RAISE EXCEPTION 'the never-funded payment did not land exactly once (the ledger guard must not refuse its own leg)';
  END IF;
  r := public.fn_sp_signup_welcome_back_run(50, '2026-10-19');
  IF (r ->> 'scanned')::int <> 0 THEN RAISE EXCEPTION 'a second run found candidates: %', r; END IF;
END $$;

-- The ledger write guard: a Welcome Back receipt to a funded player is
-- refused whoever writes it; any other promo to the same player is not.
DO $$
DECLARE refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.chip_transactions(club_id, to_user_id, amount, transaction_type, notes, metadata)
    VALUES ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', 'e2585d99-e4c3-45b9-86e8-e40620f60cb0', 25, 'promo_disbursement',
            'Welcome Back Chips - 25 free chips from the Midway Union for your first hand',
            jsonb_build_object('op_id', md5('signup-welcome-back:e2585d99-e4c3-45b9-86e8-e40620f60cb0')::uuid));
  EXCEPTION WHEN check_violation THEN
    refused := SQLERRM = 'Welcome Back Chips Refused: Player Already Received Chips';
  END;
  IF NOT refused THEN RAISE EXCEPTION 'the ledger accepted Welcome Back Chips for a funded player'; END IF;
  INSERT INTO public.chip_transactions(club_id, to_user_id, amount, transaction_type, notes, metadata)
  VALUES ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', 'e2585d99-e4c3-45b9-86e8-e40620f60cb0', 5, 'promo_disbursement',
          'Weekend Bonus - 5 chips from the Midway Union', jsonb_build_object('op_id', gen_random_uuid()));
END $$;

-- The daily report: agent to player, automated by system, and the rule check.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.fn_sp_digest_promo_chips('2026-11-13');
  IF r #>> '{agents,0,agent}' <> 'ChiToWnBaLLn' OR r #>> '{agents,0,recipients,0,player}' <> 'Kewski'
     OR (r #>> '{agents,0,total}')::numeric <> 50 THEN
    RAISE EXCEPTION 'agent rows wrong: %', r -> 'agents';
  END IF;
  IF r #>> '{systems,0,system}' <> 'Welcome Back Chips' OR r #>> '{systems,0,recipients,0,player}' <> 'MeepMeep' THEN
    RAISE EXCEPTION 'automated rows wrong: %', r -> 'systems';
  END IF;
  IF (r ->> 'total')::numeric <> 75 OR (r ->> 'agent_total')::numeric <> 50 OR (r ->> 'automated_total')::numeric <> 25 THEN
    RAISE EXCEPTION 'totals wrong: %', r;
  END IF;
  IF (r ->> 'violation_count')::int <> 1 OR r #>> '{violations,0,rule}' <> 'welcome_back_after_chips'
     OR r #>> '{violations,0,player}' <> 'MeepMeep' THEN
    RAISE EXCEPTION 'rule check wrong: %', r -> 'violations';
  END IF;
  -- The same automated campaign paid twice to one player in one club is reported.
  INSERT INTO public.chip_transactions(club_id, to_user_id, amount, transaction_type, notes, metadata, created_at) VALUES
    ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', '10000000-0000-0000-0000-0000000000f3', 20, 'promo_disbursement',
     'Midway Weekly Promo Distribution: 2026-10-26b', '{}', '2026-11-01 12:00+00'),
    ('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', '10000000-0000-0000-0000-0000000000f3', 20, 'promo_disbursement',
     'Midway Weekly Promo Distribution: 2026-10-26b', '{}', '2026-11-01 12:00+00'),
    ('fade0000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000f3', 20, 'promo_disbursement',
     'Midway Weekly Promo Distribution: 2026-10-26c', '{}', '2026-11-01 12:00+00');
  r := public.fn_sp_digest_promo_chips('2026-11-01');
  IF (r ->> 'violation_count')::int <> 1 OR r #>> '{violations,0,rule}' <> 'duplicate_automated_promo' THEN
    RAISE EXCEPTION 'a campaign paid twice in one club was not reported, or a second club was: %', r -> 'violations';
  END IF;
END $$;

-- The agent's own daily ceiling, at both promo doors and in the preview.
SELECT set_config('request.jwt.claims', '{"sub":"2e8073d8-ada2-4576-a879-02b9532a858e"}', false);
INSERT INTO public.profiles(id, username) VALUES
  ('20000000-0000-0000-0000-0000000000a1', 'DownlineA'), ('20000000-0000-0000-0000-0000000000a2', 'DownlineB'),
  ('20000000-0000-0000-0000-0000000000a3', 'DownlineC'), ('20000000-0000-0000-0000-0000000000a4', 'DownlineD'),
  ('20000000-0000-0000-0000-0000000000a5', 'DownlineE'), ('20000000-0000-0000-0000-0000000000a6', 'DownlineF');
INSERT INTO public.chip_transactions(club_id, from_user_id, to_user_id, amount, transaction_type, notes, metadata, created_at)
SELECT 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4', '2e8073d8-ada2-4576-a879-02b9532a858e', x, 50, 'promo_wallet_send', 'Cashier Send Out',
       '{"actor_role":"super_agent"}', now() - interval '2 hours'
  FROM unnest(ARRAY['20000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
                    '20000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000a4']::uuid[]) x;
DO $$
DECLARE s jsonb; a jsonb; club uuid := 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4';
BEGIN
  -- 200 sent in the last 24 hours (the 10 to ParkedPlayer 3 hours ago makes 210); 40 remain of 250.
  a := public.fn_cashier_promo_allowance(club, ARRAY['20000000-0000-0000-0000-0000000000a5'::uuid]);
  IF (a #>> '{agent_daily,remaining_chips}')::numeric <> 40 OR (a #>> '{allowances,0,remaining_chips}')::numeric <> 40 THEN
    RAISE EXCEPTION 'preview does not carry the agent''s remaining day: %', a;
  END IF;
  s := public.fn_promo_wallet_send_core_20261004(club, '20000000-0000-0000-0000-0000000000a5', 30, 'player_wallet', 'under', gen_random_uuid());
  IF NOT (s ->> 'success')::boolean THEN RAISE EXCEPTION 'a send under the cap was refused: %', s; END IF;
  s := public.fn_promo_wallet_send_core_20261004(club, '20000000-0000-0000-0000-0000000000a6', 20, 'player_wallet', 'over', gen_random_uuid());
  IF s ->> 'error_code' IS DISTINCT FROM 'promo_agent_daily_limit' OR (s ->> 'remaining_chips')::numeric <> 10
     OR s ->> 'error' <> 'Promo Limit: An Agent Can Send Only 250 Promo Chips In Any 24 Hours. 10 Chips Remain.' THEN
    RAISE EXCEPTION 'the wallet door let the agent pass the daily cap: %', s;
  END IF;
  s := public.fn_cashier_promo_ticket_send(club, '20000000-0000-0000-0000-0000000000a6', 20, 'ticket-1');
  IF s ->> 'error_code' IS DISTINCT FROM 'promo_agent_daily_limit' THEN
    RAISE EXCEPTION 'the ticket door let the agent pass the daily cap: %', s;
  END IF;
  s := public.fn_cashier_promo_ticket_send(club, '20000000-0000-0000-0000-0000000000a6', 10, 'ticket-2');
  IF NOT (s ->> 'success')::boolean THEN RAISE EXCEPTION 'a ticket within the cap was refused: %', s; END IF;
  -- The cap is a setting, changed without a migration.
  UPDATE public.sp_digest_settings SET value = 400 WHERE key = 'agent_promo_daily_chips';
  s := public.fn_promo_wallet_send_core_20261004(club, '20000000-0000-0000-0000-0000000000a6', 20, 'player_wallet', 'raised', gen_random_uuid());
  IF NOT (s ->> 'success')::boolean THEN RAISE EXCEPTION 'a raised cap was not honoured: %', s; END IF;
END $$;
SELECT set_config('request.jwt.claims', '', false);

-- The cashier names the union, with the program, instead of "A Member".
DO $$
DECLARE n text;
BEGIN
  SELECT from_name INTO n FROM public.fn_cashier_history_feed('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', 'club', 'all',
    NULL, NULL, NULL, NULL, NULL, NULL, 100) WHERE id = '07ddbdc4-701f-47cb-9fd4-7d89b9c62a91';
  IF n IS DISTINCT FROM 'Midway Union (Welcome Back Chips)' THEN RAISE EXCEPTION 'feed names the sender %', n; END IF;
  SELECT from_name INTO n FROM public.fn_cashier_history_page('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', 'club', 'all', NULL, NULL, 100, 0)
   WHERE id = '07ddbdc4-701f-47cb-9fd4-7d89b9c62a91';
  IF n IS DISTINCT FROM 'Midway Union (Welcome Back Chips)' THEN RAISE EXCEPTION 'page names the sender %', n; END IF;
  SELECT from_name INTO n FROM public.fn_cashier_transaction_history('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', 'club', 100, 0)
   WHERE id = '07ddbdc4-701f-47cb-9fd4-7d89b9c62a91';
  IF n IS DISTINCT FROM 'Midway Union (Welcome Back Chips)' THEN RAISE EXCEPTION 'history names the sender %', n; END IF;
  SELECT from_name INTO n FROM public.fn_cashier_history_feed('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', 'club', 'all',
    NULL, NULL, NULL, NULL, NULL, NULL, 100) WHERE id = '54572dd1-8aa0-403d-9dfc-2dd08433ab43';
  IF n IS DISTINCT FROM 'twin2983' THEN RAISE EXCEPTION 'a person-sent row changed its name: %', n; END IF;
  SELECT entry #>> '{from,label}' INTO n FROM public.fn_cashier_statement_rows('a41434bb-8d0c-400a-8f0d-e8b3d65afed4', NULL, 'club',
    NULL, NULL, '{}', NULL, NULL, NULL, 100) WHERE entry_id = '07ddbdc4-701f-47cb-9fd4-7d89b9c62a91';
  IF n IS DISTINCT FROM 'Midway Union' THEN RAISE EXCEPTION 'statement labels the sender %', n; END IF;
END $$;
