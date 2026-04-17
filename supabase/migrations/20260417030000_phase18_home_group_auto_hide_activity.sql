-- ══════════════════════════════════════════════════════════════════════
--  PHASE 18: HOME GROUP AUTO-HIDE (30-DAY INACTIVITY FILTER)
-- ══════════════════════════════════════════════════════════════════════
--
--  Dan's directive: if a home-game venue hasn't posted or done anything
--  new in 30 days, it gets hidden from Poker Near Me search results.
--
--  CRITICAL PRODUCT CLARIFICATION FROM DAN:
--    Auto-scheduled tournaments DO NOT count as activity. Club Commander
--    lets you schedule tournaments a year in advance — a future scheduled
--    game proves nothing about whether the group is actually alive. Only
--    HUMAN ACTIONS count.
--
--  APPROACH
--    1. Add last_activity_at + visibility_override_until columns.
--    2. Maintain last_activity_at via triggers on 6 source tables.
--    3. Backfill from existing data.
--    4. DO NOT flip is_active — public filter applied at READ time
--       in discovery APIs so the host's own dashboard view is untouched.
--
--  ACTIVITY SIGNALS (any one resets the clock)
--    ✓ social_page_posts      — posted on the group's page
--    ✓ social_page_reviews    — review was written
--    ✓ commander_home_game_reviews
--    ✓ commander_home_members — new member joined
--    ✓ commander_home_rsvps   — member RSVPed
--    ✓ commander_home_groups  — host edited the profile
--
--  NOT COUNTED (per Dan):
--    ✗ commander_home_games   — batch-schedulable a year out
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. COLUMNS ────────────────────────────────────────────────────────

ALTER TABLE commander_home_groups
    ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS visibility_override_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_home_groups_discoverable
    ON commander_home_groups (last_activity_at DESC, created_at DESC)
    WHERE is_private = false AND is_active = true;

-- ── 2. HELPER: bump a group's activity timestamp ─────────────────────

CREATE OR REPLACE FUNCTION fn_bump_home_group_activity(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_group_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE commander_home_groups
     SET last_activity_at = NOW()
   WHERE id = p_group_id;
END
$fn$;

-- ── 3. SELF-BUMP on host edit ────────────────────────────────────────
--
-- BEFORE UPDATE — sets NEW.last_activity_at inline so it's part of the
-- same write, no recursion. WHEN clause excludes updates that only
-- touch last_activity_at or updated_at (which happens when the OTHER
-- triggers call fn_bump_home_group_activity, which issues its own
-- UPDATE). If we didn't gate this, every external trigger would cause
-- a useless second write.

CREATE OR REPLACE FUNCTION fn_home_group_self_activity_bump()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.last_activity_at := NOW();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_home_group_self_activity ON commander_home_groups;
CREATE TRIGGER trg_home_group_self_activity
BEFORE UPDATE ON commander_home_groups
FOR EACH ROW
WHEN (
  (OLD.name, OLD.description, OLD.profile_photo_url, OLD.cover_photo_url,
   OLD.tagline, OLD.typical_day, OLD.typical_time, OLD.default_game_type,
   OLD.default_stakes, OLD.typical_buyin_min, OLD.typical_buyin_max,
   OLD.max_players, OLD.city, OLD.state, OLD.zip_code, OLD.latitude,
   OLD.longitude, OLD.is_private, OLD.requires_approval, OLD.is_active,
   OLD.frequency, OLD.invite_code, OLD.club_code, OLD.visibility_override_until,
   OLD.settings)
  IS DISTINCT FROM
  (NEW.name, NEW.description, NEW.profile_photo_url, NEW.cover_photo_url,
   NEW.tagline, NEW.typical_day, NEW.typical_time, NEW.default_game_type,
   NEW.default_stakes, NEW.typical_buyin_min, NEW.typical_buyin_max,
   NEW.max_players, NEW.city, NEW.state, NEW.zip_code, NEW.latitude,
   NEW.longitude, NEW.is_private, NEW.requires_approval, NEW.is_active,
   NEW.frequency, NEW.invite_code, NEW.club_code, NEW.visibility_override_until,
   NEW.settings)
)
EXECUTE FUNCTION fn_home_group_self_activity_bump();

-- ── 4. MEMBER JOIN ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_home_members_bump_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  PERFORM fn_bump_home_group_activity(NEW.group_id);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_home_members_bump_activity ON commander_home_members;
CREATE TRIGGER trg_home_members_bump_activity
AFTER INSERT ON commander_home_members
FOR EACH ROW
EXECUTE FUNCTION fn_home_members_bump_activity();

-- ── 5. RSVP ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_home_rsvps_bump_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_group_id uuid;
BEGIN
  SELECT group_id INTO v_group_id FROM commander_home_games WHERE id = NEW.game_id;
  PERFORM fn_bump_home_group_activity(v_group_id);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_home_rsvps_bump_activity ON commander_home_rsvps;
CREATE TRIGGER trg_home_rsvps_bump_activity
AFTER INSERT OR UPDATE OF response ON commander_home_rsvps
FOR EACH ROW
EXECUTE FUNCTION fn_home_rsvps_bump_activity();

-- ── 6. REVIEW (commander_home_game_reviews) ──────────────────────────

CREATE OR REPLACE FUNCTION fn_home_game_reviews_bump_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_group_id uuid;
BEGIN
  SELECT group_id INTO v_group_id FROM commander_home_games WHERE id = NEW.game_id;
  PERFORM fn_bump_home_group_activity(v_group_id);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_home_game_reviews_bump_activity ON commander_home_game_reviews;
CREATE TRIGGER trg_home_game_reviews_bump_activity
AFTER INSERT ON commander_home_game_reviews
FOR EACH ROW
EXECUTE FUNCTION fn_home_game_reviews_bump_activity();

-- ── 7. social_page_posts (only for home-group pages) ─────────────────

CREATE OR REPLACE FUNCTION fn_social_page_posts_bump_home_group()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_linked_type text;
  v_linked_id   text;
  v_group_id    uuid;
BEGIN
  SELECT linked_entity_type, linked_entity_id
    INTO v_linked_type, v_linked_id
    FROM social_pages WHERE id = NEW.page_id;

  IF v_linked_type = 'home_group' AND v_linked_id IS NOT NULL THEN
    BEGIN
      v_group_id := v_linked_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NEW;
    END;
    PERFORM fn_bump_home_group_activity(v_group_id);
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_social_page_posts_bump_home_group ON social_page_posts;
CREATE TRIGGER trg_social_page_posts_bump_home_group
AFTER INSERT ON social_page_posts
FOR EACH ROW
EXECUTE FUNCTION fn_social_page_posts_bump_home_group();

-- ── 8. social_page_reviews (only for home-group pages) ───────────────

CREATE OR REPLACE FUNCTION fn_social_page_reviews_bump_home_group()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_linked_type text;
  v_linked_id   text;
  v_group_id    uuid;
BEGIN
  SELECT linked_entity_type, linked_entity_id
    INTO v_linked_type, v_linked_id
    FROM social_pages WHERE id = NEW.page_id;

  IF v_linked_type = 'home_group' AND v_linked_id IS NOT NULL THEN
    BEGIN
      v_group_id := v_linked_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NEW;
    END;
    PERFORM fn_bump_home_group_activity(v_group_id);
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_social_page_reviews_bump_home_group ON social_page_reviews;
CREATE TRIGGER trg_social_page_reviews_bump_home_group
AFTER INSERT ON social_page_reviews
FOR EACH ROW
EXECUTE FUNCTION fn_social_page_reviews_bump_home_group();

-- ── 9. BACKFILL ──────────────────────────────────────────────────────

UPDATE commander_home_groups g
   SET last_activity_at = GREATEST(
       g.created_at,
       COALESCE((SELECT MAX(m.created_at)
                   FROM commander_home_members m
                  WHERE m.group_id = g.id), '-infinity'::timestamptz),
       COALESCE((SELECT MAX(r.updated_at)
                   FROM commander_home_rsvps r
                   JOIN commander_home_games hg ON hg.id = r.game_id
                  WHERE hg.group_id = g.id), '-infinity'::timestamptz),
       COALESCE((SELECT MAX(rv.created_at)
                   FROM commander_home_game_reviews rv
                   JOIN commander_home_games hg ON hg.id = rv.game_id
                  WHERE hg.group_id = g.id), '-infinity'::timestamptz),
       COALESCE((SELECT MAX(p.created_at)
                   FROM social_page_posts p
                   JOIN social_pages sp ON sp.id = p.page_id
                  WHERE sp.linked_entity_type = 'home_group'
                    AND sp.linked_entity_id = g.id::text), '-infinity'::timestamptz),
       COALESCE((SELECT MAX(pr.created_at)
                   FROM social_page_reviews pr
                   JOIN social_pages sp ON sp.id = pr.page_id
                  WHERE sp.linked_entity_type = 'home_group'
                    AND sp.linked_entity_id = g.id::text), '-infinity'::timestamptz)
   );
