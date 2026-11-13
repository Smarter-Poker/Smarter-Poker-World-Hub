DO $$ DECLARE r jsonb := fn_sp_digest_house_figures('2026-11-10'); BEGIN
-- BBJ rake: Central day, trailing seven Central days (Nov 4 to Nov 10), Central month to date.
IF (r#>>'{bbj_rake,day}')::numeric<>4 OR (r#>>'{bbj_rake,week}')::numeric<>7 OR (r#>>'{bbj_rake,week_days}')::int<>3
OR (r#>>'{bbj_rake,month}')::numeric<>107 OR (r#>>'{bbj_rake,month_days}')::int<>4
OR r->>'week_from'<>'2026-11-04' OR r->>'month_from'<>'2026-11-01' THEN RAISE EXCEPTION 'bbj mismatch %',r; END IF;
-- Horses: drop paid minus what the other accounts lost; tournaments, Diamond Arena and the next day are excluded.
IF (r#>>'{horse_cash,day,net}')::numeric<>-10 OR (r#>>'{horse_cash,day,rake}')::numeric<>9
OR (r#>>'{horse_cash,day,bbj}')::numeric<>3.5 OR (r#>>'{horse_cash,day,vs_others}')::numeric<>2.5
OR (r#>>'{horse_cash,day,net_bb_utc}')::numeric<>-50 THEN RAISE EXCEPTION 'horse day mismatch %',r; END IF;
IF (r#>>'{horse_cash,day,net}')::numeric <> -((r#>>'{horse_cash,day,rake}')::numeric+(r#>>'{horse_cash,day,bbj}')::numeric)+(r#>>'{horse_cash,day,vs_others}')::numeric
THEN RAISE EXCEPTION 'horse identity broken %',r; END IF;
IF (r#>>'{horse_cash,month,net}')::numeric<>-117 OR (r#>>'{horse_cash,month,rake}')::numeric<>13.8
OR (r#>>'{horse_cash,month,bbj}')::numeric<>106.4 OR (r#>>'{horse_cash,month,vs_others}')::numeric<>3.2
OR (r#>>'{horse_cash,month,days}')::int<>4 THEN RAISE EXCEPTION 'horse month mismatch %',r; END IF;
IF (r-'generated_at') IS DISTINCT FROM (fn_sp_digest_house_figures('2026-11-10')-'generated_at') THEN RAISE EXCEPTION 'nonrepeatable report'; END IF;
END $$;
-- A day without a snapshot reports nothing for the day rather than a made-up 0.
DO $$ DECLARE r jsonb := fn_sp_digest_house_figures('2026-11-12'); BEGIN
IF r#>'{bbj_rake,day}' <> 'null'::jsonb OR r#>'{horse_cash,day}' <> 'null'::jsonb THEN RAISE EXCEPTION 'missing day invented %',r; END IF;
END $$;
DO $$ BEGIN IF has_function_privilege('anon','fn_sp_digest_house_figures(date)','EXECUTE') THEN RAISE EXCEPTION 'anon can run the report'; END IF; END $$;
