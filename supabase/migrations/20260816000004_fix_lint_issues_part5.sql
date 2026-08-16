CREATE OR REPLACE FUNCTION public.fn_delete_user_gdpr(p_user_id uuid, p_requested_by uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_request_id uuid;
  v_req_role text;
  v_summary jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  IF p_user_id IS NULL OR p_requested_by IS NULL THEN
    RAISE EXCEPTION 'user_id and requested_by required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT role INTO v_req_role FROM public.profiles WHERE id = p_requested_by;
  IF p_user_id <> p_requested_by AND v_req_role NOT IN ('admin','superadmin','god') THEN
    RAISE EXCEPTION 'only the user or a platform admin may request GDPR deletion' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.gdpr_deletion_requests (user_id, requested_by, reason, status)
  VALUES (p_user_id, p_requested_by, p_reason, 'pending')
  RETURNING id INTO v_request_id;

  UPDATE public.chip_ledger                    SET performed_by = NULL WHERE performed_by = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('chip_ledger', v_n);
  UPDATE public.bus_event_log                  SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bus_event_log', v_n);
  UPDATE public.admin_audit_log                SET admin_user_id = NULL WHERE admin_user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('admin_audit_log', v_n);
  UPDATE public.club_arena_audit_logs          SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('club_arena_audit_logs', v_n);
  UPDATE public.club_arena_messages            SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('club_arena_messages', v_n);
  UPDATE public.club_chat                      SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('club_chat', v_n);
  UPDATE public.table_chat                     SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('table_chat', v_n);
  UPDATE public.tournament_players             SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('tournament_players', v_n);
  UPDATE public.tournament_registrations       SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('tournament_registrations', v_n);

  UPDATE public.arcade_duels SET player1_id = NULL WHERE player1_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('arcade_duels_player1', v_n);
  UPDATE public.arcade_duels SET player2_id = NULL WHERE player2_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('arcade_duels_player2', v_n);
  UPDATE public.arcade_duels SET winner_id  = NULL WHERE winner_id  = p_user_id;

  UPDATE public.social_post_comments           SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('social_post_comments', v_n);

  UPDATE public.unions                         SET owner_id = NULL WHERE owner_id = p_user_id;
  UPDATE public.union_announcements            SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.union_wallet_transactions      SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.geeves_analytics               SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.live_help_analytics            SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.content_schedule               SET author_id = NULL WHERE author_id = p_user_id;
  UPDATE public.commander_buyin_transactions   SET player_id = NULL WHERE player_id = p_user_id;
  UPDATE public.commander_home_seats           SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.commander_sessions             SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.opponent_profiles              SET opponent_id = NULL WHERE opponent_id = p_user_id;
  UPDATE public.player_notes                   SET target_user_id = NULL WHERE target_user_id = p_user_id;
  UPDATE public.poy_leaderboard                SET player_id = NULL WHERE player_id = p_user_id;
  UPDATE public.arcade_jackpot                 SET last_winner_id = NULL WHERE last_winner_id = p_user_id;

  -- Anonymize the profiles row. BUG-10 fix: drop the bogus `metadata`
  -- column assignment (column does not exist) and also wipe the jsonb
  -- preference columns which can contain personalization data.
  UPDATE public.profiles
    SET
      display_name          = 'Deleted User',
      username              = 'deleted_' || substring(id::text, 1, 8),
      email                 = NULL,
      avatar_url            = NULL,
      bio                   = NULL,
      phone                 = NULL,
      preferences           = '{}'::jsonb,
      hub_preferences       = '{}'::jsonb,
      friend_preferences    = '{}'::jsonb,
      store_preferences     = '{}'::jsonb,
      messenger_preferences = '{}'::jsonb,
      reels_preferences     = '{}'::jsonb
  WHERE id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('profiles_anonymized', v_n);

  v_summary := jsonb_build_object(
    'request_id', v_request_id,
    'user_id', p_user_id,
    'requested_by', p_requested_by,
    'anonymized_columns', v_counts
  );

  UPDATE public.gdpr_deletion_requests
    SET status = 'anonymized',
        anonymized_at = now(),
        summary = v_summary
  WHERE id = v_request_id;

  PERFORM public.fn_log_admin_action(
    p_admin_user_id := p_requested_by,
    p_action := 'user.gdpr_delete_anonymized',
    p_target_type := 'user',
    p_target_id := p_user_id::text,
    p_details := v_summary,
    p_before_state := NULL,
    p_after_state := NULL,
    p_ip_address := NULL,
    p_user_agent := NULL,
    p_request_id := v_request_id::text
  );

  RETURN v_summary;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.gdpr_deletion_requests
    SET status = 'failed', error_detail = SQLERRM
  WHERE id = v_request_id;
  RAISE;
END;
$function$

