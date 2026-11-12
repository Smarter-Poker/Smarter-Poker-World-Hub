DO $$ DECLARE r jsonb:=fn_sp_digest_player_totals('2026-11-10'); BEGIN
IF r ? 'error' THEN RAISE EXCEPTION 'detailed report failed %',r; END IF;
IF jsonb_array_length(r->'players')<>1 OR r#>>'{players,0,username}'<>'kingfish'
 OR (r#>>'{totals,cash_net}')::numeric<>6 OR (r#>>'{totals,tournament_net}')::numeric<>-20
 OR (r#>>'{totals,net}')::numeric<>-14 THEN RAISE EXCEPTION 'Kingfish excluded %',r; END IF;
END $$;
-- If Kingfish also meets the standard human filter, UNION still counts once.
INSERT INTO smarter_private.sp_real_humans VALUES('47965354-0e56-43ef-931c-ddaab82af765','kingfish');
DO $$ DECLARE r jsonb:=fn_sp_digest_player_totals('2026-11-10'); BEGIN
IF jsonb_array_length(r->'players')<>1 OR (r#>>'{totals,net}')::numeric<>-14 THEN RAISE EXCEPTION 'Kingfish counted twice %',r; END IF;
END $$;
CREATE FUNCTION fn_sp_digest_player_period(date) RETURNS jsonb LANGUAGE sql AS $$ SELECT fn_sp_digest_player_totals($1)||'{"period":{"day":{},"week":{},"month":{}}}'::jsonb $$;
INSERT INTO rake_attributions(player_id,club_id,created_at,bbj_attributed_contribution) VALUES('47965354-0e56-43ef-931c-ddaab82af765','c0000000-0000-0000-0000-000000000001','2026-11-10 06:00Z',0.50);
DO $$ DECLARE r jsonb:=fn_sp_digest_player_report('2026-11-10'); BEGIN
IF (r#>>'{totals,bbj_rake}')::numeric<>0.5 OR (r#>>'{players,0,bbj_rake}')::numeric<>0.5
 OR (r#>>'{totals,net}')::numeric<>-14 THEN RAISE EXCEPTION 'Kingfish BBJ omitted/double-counted %',r; END IF;
END $$;
