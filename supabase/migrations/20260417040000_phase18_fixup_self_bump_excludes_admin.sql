-- ══════════════════════════════════════════════════════════════════════
--  PHASE 18 FIXUP: self-bump trigger WHEN clause
-- ══════════════════════════════════════════════════════════════════════
--
--  The original Phase 18 self-bump trigger fired when ANY "user-visible"
--  column on commander_home_groups changed — including admin toggles:
--    is_private, is_active, requires_approval,
--    visibility_override_until, settings
--
--  These are NOT host engagement signals. Specifically:
--    visibility_override_until — if an admin pays for extended visibility,
--      that's the OPPOSITE of "host is engaged" — they're buying
--      visibility precisely because they can't be active. Bumping
--      last_activity_at when override is set would cause the group to
--      stay visible via clause (a) for 30 extra days AFTER the override
--      expires — defeating the point of the override being time-bounded.
--    is_private / is_active / requires_approval — admin settings that
--      change the security/discoverability model, not host-engagement.
--    settings — catch-all jsonb field; same reasoning.
--
--  This migration drops and recreates the trigger with a WHEN clause
--  scoped to HOST CONTENT EDITS only:
--    identity: name, description, tagline, profile_photo_url, cover_photo_url
--    game spec: default_game_type, default_stakes, typical_buyin_min/max, max_players
--    schedule: typical_day, typical_time, frequency
--    location: city, state, zip_code, latitude, longitude
--    codes: invite_code, club_code
--
--  Verified end-to-end in production before this fixup:
--    ✓ Clause (a) last_activity_at >= 30d — filter visible via recent trigger
--    ✓ Clause (b) created_at >= 30d       — filter hidden when both stale
--    ✓ Clause (c) visibility_override_until > NOW() — filter visible via override
--
--  Cached response caveat noted: /api/public/home-games/discover is NOT
--  cached at the API layer (cache-control: no-store set), but Vercel
--  edge still served a ~30s stale page to the first probe after deploy.
--  Cache-busted requests returned correct results.
-- ══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_home_group_self_activity ON commander_home_groups;

CREATE TRIGGER trg_home_group_self_activity
BEFORE UPDATE ON commander_home_groups
FOR EACH ROW
WHEN (
  (OLD.name, OLD.description, OLD.profile_photo_url, OLD.cover_photo_url,
   OLD.tagline, OLD.typical_day, OLD.typical_time, OLD.default_game_type,
   OLD.default_stakes, OLD.typical_buyin_min, OLD.typical_buyin_max,
   OLD.max_players, OLD.city, OLD.state, OLD.zip_code, OLD.latitude,
   OLD.longitude, OLD.frequency, OLD.invite_code, OLD.club_code)
  IS DISTINCT FROM
  (NEW.name, NEW.description, NEW.profile_photo_url, NEW.cover_photo_url,
   NEW.tagline, NEW.typical_day, NEW.typical_time, NEW.default_game_type,
   NEW.default_stakes, NEW.typical_buyin_min, NEW.typical_buyin_max,
   NEW.max_players, NEW.city, NEW.state, NEW.zip_code, NEW.latitude,
   NEW.longitude, NEW.frequency, NEW.invite_code, NEW.club_code)
)
EXECUTE FUNCTION fn_home_group_self_activity_bump();
