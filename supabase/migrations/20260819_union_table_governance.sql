-- ============================================================================
-- UNION TABLE GOVERNANCE (2026-08-19) — APPLIED to production via Supabase MCP
-- as migrations: union_table_governance
--
-- Hard rule (Dan): a club inside a union cannot own union-visible games.
-- Everything a union club runs is union-owned (union_id stamped) unless
-- explicitly created as a private club game (is_private = true, never
-- union-visible). Also repairs the clubs.union_id denormalized mirror
-- (Club JAQK had union_clubs membership but a NULL mirror, so rake routed
-- to its own treasury instead of the union wallet) and keeps it in sync
-- going forward.
-- ============================================================================

-- 1. Schema additions ------------------------------------------------------
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE settlement_periods ADD COLUMN IF NOT EXISTS seated_stack_snapshot numeric;

-- 2. Mirror sync: clubs.union_id always follows union_clubs -----------------
CREATE OR REPLACE FUNCTION fn_sync_club_union_mirror() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE clubs
       SET union_id = NEW.union_id,
           club_commission_rate = COALESCE(NEW.club_commission_rate, club_commission_rate)
     WHERE id = NEW.club_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE clubs SET union_id = NULL
     WHERE id = OLD.club_id AND union_id = OLD.union_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_union_clubs_sync_mirror ON union_clubs;
CREATE TRIGGER trg_union_clubs_sync_mirror
AFTER INSERT OR DELETE ON union_clubs
FOR EACH ROW EXECUTE FUNCTION fn_sync_club_union_mirror();

-- 3. Ownership auto-stamp: tables -------------------------------------------
CREATE OR REPLACE FUNCTION fn_stamp_table_union_ownership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_union uuid;
BEGIN
  -- Private club games are never union-visible.
  IF COALESCE(NEW.is_private, false) THEN
    NEW.union_id := NULL;
    RETURN NEW;
  END IF;
  -- Non-private game created under a union club: stamp union ownership.
  IF NEW.union_id IS NULL AND NEW.club_id IS NOT NULL THEN
    SELECT uc.union_id INTO v_union FROM union_clubs uc WHERE uc.club_id = NEW.club_id LIMIT 1;
    IF v_union IS NOT NULL THEN
      NEW.union_id := v_union;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tables_union_ownership ON tables;
CREATE TRIGGER trg_tables_union_ownership
BEFORE INSERT ON tables
FOR EACH ROW EXECUTE FUNCTION fn_stamp_table_union_ownership();

-- 4. Ownership auto-stamp: tournaments --------------------------------------
CREATE OR REPLACE FUNCTION fn_stamp_tournament_union_ownership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_union uuid;
BEGIN
  IF COALESCE(NEW.is_private, false) THEN
    NEW.union_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.union_id IS NULL AND NEW.club_id IS NOT NULL THEN
    SELECT uc.union_id INTO v_union FROM union_clubs uc WHERE uc.club_id = NEW.club_id LIMIT 1;
    IF v_union IS NOT NULL THEN
      NEW.union_id := v_union;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tournaments_union_ownership ON tournaments;
CREATE TRIGGER trg_tournaments_union_ownership
BEFORE INSERT ON tournaments
FOR EACH ROW EXECUTE FUNCTION fn_stamp_tournament_union_ownership();

-- 5. Data repair -------------------------------------------------------------
-- 5a. Sync the clubs.union_id mirror from union_clubs (repairs Club JAQK).
UPDATE clubs c
   SET union_id = uc.union_id,
       club_commission_rate = COALESCE(uc.club_commission_rate, c.club_commission_rate)
  FROM union_clubs uc
 WHERE uc.club_id = c.id
   AND c.union_id IS DISTINCT FROM uc.union_id;

-- 5b. Stamp union ownership on open tournaments of union clubs.
UPDATE tournaments t
   SET union_id = uc.union_id
  FROM union_clubs uc
 WHERE uc.club_id = t.club_id
   AND t.union_id IS NULL
   AND COALESCE(t.is_private, false) = false
   AND t.status IN ('ANNOUNCED','SCHEDULED','REGISTERING','LATE_REG','RUNNING');

-- 6. Assertions ---------------------------------------------------------------
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM union_clubs uc JOIN clubs c ON c.id = uc.club_id
   WHERE c.union_id IS DISTINCT FROM uc.union_id;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % clubs still have a stale union_id mirror', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM tournaments t JOIN union_clubs uc ON uc.club_id = t.club_id
   WHERE t.union_id IS NULL
     AND COALESCE(t.is_private, false) = false
     AND t.status IN ('ANNOUNCED','SCHEDULED','REGISTERING','LATE_REG','RUNNING');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % open union-club tournaments still unstamped', v_bad;
  END IF;
END $$;
