-- =====================================================
-- SMARTER CAPTAIN - PHASE 4 DATABASE MIGRATION
-- =====================================================
-- Tables: 3 (as specified in SCOPE_LOCK.md)
-- Phase: Home Games
-- =====================================================

-- ===================
-- TABLE 1: captain_home_groups
-- ===================
-- Private poker groups/clubs that can host home games

CREATE TABLE IF NOT EXISTS captain_home_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Owner/Host
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Privacy settings
  is_private BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT true,
  invite_code TEXT UNIQUE,

  -- Location (approximate for discovery)
  city TEXT,
  state TEXT,
  zip_code TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),

  -- Game preferences
  default_game_type TEXT DEFAULT 'nlhe',
  default_stakes TEXT,
  typical_buyin_min INTEGER,
  typical_buyin_max INTEGER,
  max_players INTEGER DEFAULT 9,

  -- Schedule
  typical_day TEXT,
  typical_time TIME,
  frequency TEXT CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'irregular')),

  -- Stats
  member_count INTEGER DEFAULT 1,
  games_hosted INTEGER DEFAULT 0,

  -- Settings
  settings JSONB DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_groups_owner ON captain_home_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_home_groups_location ON captain_home_groups(city, state);
CREATE INDEX IF NOT EXISTS idx_home_groups_invite ON captain_home_groups(invite_code);

-- ===================
-- TABLE 2: captain_home_members
-- ===================
-- Membership in home game groups

CREATE TABLE IF NOT EXISTS captain_home_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Role
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'banned')),

  -- Stats
  games_attended INTEGER DEFAULT 0,
  games_hosted INTEGER DEFAULT 0,
  last_attended TIMESTAMPTZ,

  -- Preferences
  can_host BOOLEAN DEFAULT false,
  notifications_enabled BOOLEAN DEFAULT true,

  -- Metadata
  invited_by UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_home_members_group ON captain_home_members(group_id, status);
CREATE INDEX IF NOT EXISTS idx_home_members_user ON captain_home_members(user_id, status);

-- ===================
-- TABLE 3: captain_home_games
-- ===================
-- Scheduled home game events

CREATE TABLE IF NOT EXISTS captain_home_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE CASCADE,

  -- Host (may differ from group owner)
  host_id UUID REFERENCES profiles(id),

  -- Game details
  title TEXT,
  description TEXT,
  game_type TEXT NOT NULL DEFAULT 'nlhe',
  stakes TEXT,

  -- Buy-in
  buyin_min INTEGER,
  buyin_max INTEGER,

  -- Schedule
  scheduled_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,

  -- Location
  address TEXT,
  address_visible_to TEXT DEFAULT 'rsvp' CHECK (address_visible_to IN ('all', 'rsvp', 'approved')),
  location_notes TEXT,

  -- Capacity
  max_players INTEGER DEFAULT 9,
  min_players INTEGER DEFAULT 4,

  -- RSVP tracking
  rsvp_yes INTEGER DEFAULT 0,
  rsvp_maybe INTEGER DEFAULT 0,
  rsvp_no INTEGER DEFAULT 0,
  waitlist_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')),

  -- Settings
  allow_guests BOOLEAN DEFAULT false,
  guest_limit INTEGER DEFAULT 1,
  food_drinks TEXT,
  special_rules TEXT,

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_games_group ON captain_home_games(group_id, status);
CREATE INDEX IF NOT EXISTS idx_home_games_date ON captain_home_games(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_home_games_host ON captain_home_games(host_id);

-- ===================
-- TABLE 4: captain_home_rsvps
-- ===================
-- RSVPs for home games

CREATE TABLE IF NOT EXISTS captain_home_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES captain_home_games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Response
  response TEXT NOT NULL CHECK (response IN ('yes', 'maybe', 'no', 'waitlist')),

  -- Guest info
  bringing_guests INTEGER DEFAULT 0,
  guest_names TEXT[],

  -- Notes
  message TEXT,

  -- Status
  is_confirmed BOOLEAN DEFAULT false,
  seat_number INTEGER,

  -- Timing
  responded_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(game_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_home_rsvps_game ON captain_home_rsvps(game_id, response);
CREATE INDEX IF NOT EXISTS idx_home_rsvps_user ON captain_home_rsvps(user_id);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_home_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_rsvps ENABLE ROW LEVEL SECURITY;

-- Groups: Public groups visible to all, private to members only
CREATE POLICY home_groups_select ON captain_home_groups
  FOR SELECT USING (
    NOT is_private OR
    owner_id = auth.uid() OR
    id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND status = 'approved')
  );

CREATE POLICY home_groups_insert ON captain_home_groups
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY home_groups_update ON captain_home_groups
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY home_groups_delete ON captain_home_groups
  FOR DELETE USING (owner_id = auth.uid());

-- Members: Visible to group members
CREATE POLICY home_members_select ON captain_home_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND status = 'approved')
  );

CREATE POLICY home_members_insert ON captain_home_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid()) OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY home_members_update ON captain_home_members
  FOR UPDATE USING (
    user_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid()) OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY home_members_delete ON captain_home_members
  FOR DELETE USING (
    user_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid())
  );

-- Games: Visible to group members
CREATE POLICY home_games_select ON captain_home_games
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND status = 'approved') OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid())
  );

CREATE POLICY home_games_insert ON captain_home_games
  FOR INSERT WITH CHECK (
    host_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid()) OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY home_games_update ON captain_home_games
  FOR UPDATE USING (
    host_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid()) OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY home_games_delete ON captain_home_games
  FOR DELETE USING (
    host_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid())
  );

-- RSVPs: Users can manage their own, hosts can view all
CREATE POLICY home_rsvps_select ON captain_home_rsvps
  FOR SELECT USING (
    user_id = auth.uid() OR
    game_id IN (SELECT id FROM captain_home_games WHERE host_id = auth.uid()) OR
    game_id IN (SELECT id FROM captain_home_games WHERE group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND status = 'approved'))
  );

CREATE POLICY home_rsvps_insert ON captain_home_rsvps
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY home_rsvps_update ON captain_home_rsvps
  FOR UPDATE USING (
    user_id = auth.uid() OR
    game_id IN (SELECT id FROM captain_home_games WHERE host_id = auth.uid())
  );

CREATE POLICY home_rsvps_delete ON captain_home_rsvps
  FOR DELETE USING (user_id = auth.uid());

-- ===================
-- FUNCTIONS
-- ===================

-- Update member count when members change
CREATE OR REPLACE FUNCTION update_home_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE captain_home_groups
  SET
    member_count = (
      SELECT COUNT(*) FROM captain_home_members
      WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
      AND status = 'approved'
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.group_id, OLD.group_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_member_count_trigger ON captain_home_members;
CREATE TRIGGER home_member_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON captain_home_members
FOR EACH ROW EXECUTE FUNCTION update_home_group_member_count();

-- Update RSVP counts when RSVPs change
CREATE OR REPLACE FUNCTION update_home_game_rsvp_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE captain_home_games
  SET
    rsvp_yes = (SELECT COUNT(*) FROM captain_home_rsvps WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'yes'),
    rsvp_maybe = (SELECT COUNT(*) FROM captain_home_rsvps WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'maybe'),
    rsvp_no = (SELECT COUNT(*) FROM captain_home_rsvps WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'no'),
    waitlist_count = (SELECT COUNT(*) FROM captain_home_rsvps WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'waitlist'),
    updated_at = now()
  WHERE id = COALESCE(NEW.game_id, OLD.game_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_rsvp_count_trigger ON captain_home_rsvps;
CREATE TRIGGER home_rsvp_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON captain_home_rsvps
FOR EACH ROW EXECUTE FUNCTION update_home_game_rsvp_counts();

-- Generate unique invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := upper(substr(md5(random()::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_group_invite_code_trigger ON captain_home_groups;
CREATE TRIGGER home_group_invite_code_trigger
BEFORE INSERT ON captain_home_groups
FOR EACH ROW EXECUTE FUNCTION generate_invite_code();

-- Auto-add owner as member
CREATE OR REPLACE FUNCTION auto_add_group_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO captain_home_members (group_id, user_id, role, status, joined_at)
  VALUES (NEW.id, NEW.owner_id, 'owner', 'approved', now())
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_group_owner_trigger ON captain_home_groups;
CREATE TRIGGER home_group_owner_trigger
AFTER INSERT ON captain_home_groups
FOR EACH ROW EXECUTE FUNCTION auto_add_group_owner();
