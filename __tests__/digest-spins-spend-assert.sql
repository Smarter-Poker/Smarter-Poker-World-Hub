DO $$ DECLARE r jsonb; BEGIN
r:=fn_sp_digest_spins_spend('2026-10-27');
IF (r#>>'{spins,total,spins}')::int<>2 OR (r#>>'{spins,total,chips_paid}')::numeric<>2.75
OR (r#>>'{spins,total,diamonds_collected}')::numeric<>450 OR (r#>>'{spins,total,profit_chip_equivalent}')::numeric<>1.75
OR (r#>>'{spins,humans,chips_paid}')::numeric<>0.75 OR (r#>>'{spins,horses,chips_paid}')::numeric<>2
OR jsonb_array_length(r->'spend')<>3 THEN RAISE EXCEPTION 'report mismatch %',r; END IF;
IF (r->'spins') IS DISTINCT FROM (fn_sp_digest_spins_spend('2026-10-27')->'spins') THEN RAISE EXCEPTION 'nonrepeatable report'; END IF;
END $$;
INSERT INTO wheel_bonus_awards VALUES('10000000-0000-0000-0000-000000000002',NULL,100);
DO $$ BEGIN IF (fn_sp_digest_spins_spend('2026-10-27')#>>'{spins,total,pending_awards}')::int<>1 THEN RAISE EXCEPTION 'missing pending liability'; END IF; END $$;
INSERT INTO wheel_card_awards VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',NULL,NULL);
DO $$ BEGIN IF (fn_sp_digest_spins_spend('2026-10-27')#>>'{spins,total,pending_awards}')::int<>2 THEN RAISE EXCEPTION 'pending card missing'; END IF; END $$;
UPDATE wheel_card_awards SET paid_diamonds=25,picked_at='2026-10-29 01:00Z';
DO $$ DECLARE r jsonb:=fn_sp_digest_spins_spend('2026-10-27'); BEGIN
IF (r#>>'{spins,humans,diamonds_paid}')::numeric<>25 OR (r#>>'{spins,humans,profit_chip_equivalent}')::numeric<>0.5 THEN RAISE EXCEPTION 'card settlement mismatch %',r; END IF;
END $$;
