-- ═══════════════════════════════════════════════════════════════════════════════
-- WIRE MIDWAY UNION OWNERSHIP — Connect Dan's Account to Existing Midway Union
-- ═══════════════════════════════════════════════════════════════════════════════
-- Run in Supabase SQL Editor
-- Finds existing Midway Union + Dan's Shark Club account, then:
--   1. Sets unions.owner_id = Dan
--   2. Creates/updates union_admins record (owner role, full_access)
--   3. Wires Shark Club → Midway Union (clubs.union_id + union_clubs)
--   4. Enables auto-settlement on Shark Club
--   5. Opens initial settlement period if none exists
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_dan_id UUID;
  v_shark_club_uuid UUID;
  v_union_id UUID;
  v_period_exists BOOLEAN;
BEGIN
  -- ─── STEP 1: Find Dan's account (Shark Club owner) ───
  SELECT id, owner_id
  INTO v_shark_club_uuid, v_dan_id
  FROM clubs
  WHERE club_id = 25450
  LIMIT 1;

  IF v_dan_id IS NULL THEN
    RAISE EXCEPTION 'Shark Club (club_id=25450) not found!';
  END IF;
  RAISE NOTICE '✅ Dan UUID: %  |  Shark Club UUID: %', v_dan_id, v_shark_club_uuid;

  -- ─── STEP 2: Find existing Midway Union ───
  SELECT id INTO v_union_id
  FROM unions
  WHERE name ILIKE '%midway%'
  LIMIT 1;

  IF v_union_id IS NULL THEN
    -- Fallback: find any union that already has Shark Club
    SELECT union_id INTO v_union_id
    FROM clubs
    WHERE id = v_shark_club_uuid AND union_id IS NOT NULL;
  END IF;

  IF v_union_id IS NULL THEN
    -- Last fallback: find any union at all
    SELECT id INTO v_union_id FROM unions LIMIT 1;
  END IF;

  IF v_union_id IS NULL THEN
    RAISE EXCEPTION 'No Midway Union found in unions table!';
  END IF;
  RAISE NOTICE '✅ Midway Union UUID: %', v_union_id;

  -- ─── STEP 3: Set Dan as union owner ───
  UPDATE unions
  SET owner_id = v_dan_id,
      updated_at = NOW()
  WHERE id = v_union_id;
  RAISE NOTICE '✅ unions.owner_id set to Dan';

  -- ─── STEP 4: Ensure union_admins record (owner role) ───
  INSERT INTO union_admins (union_id, user_id, role, permissions)
  VALUES (
    v_union_id,
    v_dan_id,
    'union_lead',
    '{"full_access": true, "manage_clubs": true, "mint_chips": true, "view_reports": true, "manage_admins": true, "manage_settlement": true, "manage_bbj": true}'::jsonb
  )
  ON CONFLICT (union_id, user_id) DO UPDATE SET
    role = 'union_lead',
    permissions = '{"full_access": true, "manage_clubs": true, "mint_chips": true, "view_reports": true, "manage_admins": true, "manage_settlement": true, "manage_bbj": true}'::jsonb;
  RAISE NOTICE '✅ union_admins: Dan = owner';

  -- ─── STEP 5: Wire Shark Club → Midway Union ───
  UPDATE clubs
  SET union_id = v_union_id,
      auto_settlement_enabled = true,
      club_commission_rate = COALESCE(club_commission_rate, 0.90)
  WHERE id = v_shark_club_uuid;
  RAISE NOTICE '✅ clubs.union_id set on Shark Club';

  -- Ensure union_clubs join record
  INSERT INTO union_clubs (union_id, club_id, club_commission_rate)
  VALUES (v_union_id, v_shark_club_uuid, 0.90)
  ON CONFLICT (union_id, club_id) DO UPDATE SET
    club_commission_rate = COALESCE(union_clubs.club_commission_rate, 0.90);
  RAISE NOTICE '✅ union_clubs record ensured';

  -- ─── STEP 6: Open initial settlement period if none exists ───
  SELECT EXISTS(
    SELECT 1 FROM settlement_periods
    WHERE club_id = v_shark_club_uuid AND status = 'open'
  ) INTO v_period_exists;

  IF NOT v_period_exists THEN
    INSERT INTO settlement_periods (
      club_id, union_id, period_number, year,
      start_at, end_at, status,
      total_rake_collected, total_hands_dealt,
      total_player_winnings, total_player_losses
    ) VALUES (
      v_shark_club_uuid, v_union_id, 1, EXTRACT(YEAR FROM NOW()),
      NOW(), NOW() + INTERVAL '7 days', 'open',
      0, 0, 0, 0
    );
    RAISE NOTICE '✅ Settlement period #1 opened';
  ELSE
    RAISE NOTICE '⏭️ Settlement period already open — skipped';
  END IF;

  -- ─── STEP 7: Ensure BBJ defaults on union if missing ───
  UPDATE unions SET
    settings = COALESCE(settings, '{}'::jsonb) ||
      jsonb_build_object(
        'union_rake_hold', COALESCE((settings->>'union_rake_hold')::numeric, 0.10),
        'default_agent_commission', COALESCE((settings->>'default_agent_commission')::numeric, 0.50),
        'bbj_split', COALESCE(settings->'bbj_split', '{"main":40,"backup":30,"promo":30}'::jsonb)
      ),
    main_bbj_balance = COALESCE(main_bbj_balance, 0),
    backup_bbj_balance = COALESCE(backup_bbj_balance, 0),
    promo_fund_balance = COALESCE(promo_fund_balance, 0)
  WHERE id = v_union_id;
  RAISE NOTICE '✅ BBJ defaults ensured';

  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '  MIDWAY UNION WIRING COMPLETE';
  RAISE NOTICE '  Union:  %', v_union_id;
  RAISE NOTICE '  Owner:  %', v_dan_id;
  RAISE NOTICE '  Club:   % (Shark Club)', v_shark_club_uuid;
  RAISE NOTICE '══════════════════════════════════════════';
END $$;
