-- =====================================================
-- SMARTER CAPTAIN - PHASE 4 DATABASE MIGRATION
-- =====================================================
-- Tables: 7 (Home Games + Messaging + Notifications)
-- Phase: Home Games & Club Communication
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

  -- Club Identity (for QR codes and sharing)
  club_code TEXT UNIQUE, -- Short 6-char code for easy sharing
  invite_code TEXT UNIQUE, -- 8-char invite code
  qr_code_url TEXT, -- Stored QR code image URL (optional, can generate dynamically)

  -- Privacy settings
  is_private BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT true,

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
CREATE INDEX IF NOT EXISTS idx_home_groups_club_code ON captain_home_groups(club_code);

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

  -- Notification preferences (granular)
  notify_announcements BOOLEAN DEFAULT true,
  notify_new_games BOOLEAN DEFAULT true,
  notify_game_reminders BOOLEAN DEFAULT true,
  notify_rsvp_updates BOOLEAN DEFAULT true,

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
-- TABLE 5: captain_club_announcements
-- ===================
-- Club announcements and messages to members

CREATE TABLE IF NOT EXISTS captain_club_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE CASCADE,

  -- Author
  author_id UUID REFERENCES profiles(id),

  -- Content
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'announcement' CHECK (message_type IN ('announcement', 'game_reminder', 'event', 'update', 'urgent')),

  -- Targeting
  target_all BOOLEAN DEFAULT true,
  target_member_ids UUID[], -- If not target_all, specific members

  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,

  -- Related content
  related_game_id UUID REFERENCES captain_home_games(id) ON DELETE SET NULL,

  -- Push notification
  send_push BOOLEAN DEFAULT true,
  push_sent BOOLEAN DEFAULT false,
  push_sent_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_announcements_group ON captain_club_announcements(group_id, status);
CREATE INDEX IF NOT EXISTS idx_club_announcements_scheduled ON captain_club_announcements(scheduled_for) WHERE status = 'scheduled';

-- ===================
-- TABLE 6: captain_push_subscriptions
-- ===================
-- Push notification device tokens per user per club

CREATE TABLE IF NOT EXISTS captain_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE CASCADE,

  -- Device info
  device_token TEXT NOT NULL,
  device_type TEXT CHECK (device_type IN ('ios', 'android', 'web')),
  device_name TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, group_id, device_token)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON captain_push_subscriptions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_push_subs_group ON captain_push_subscriptions(group_id, is_active);

-- ===================
-- TABLE 7: captain_notification_log
-- ===================
-- Log of sent notifications for tracking/debugging

CREATE TABLE IF NOT EXISTS captain_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE SET NULL,
  announcement_id UUID REFERENCES captain_club_announcements(id) ON DELETE SET NULL,

  -- Notification details
  notification_type TEXT NOT NULL,
  title TEXT,
  body TEXT,

  -- Delivery
  channel TEXT CHECK (channel IN ('push', 'sms', 'email', 'in_app')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'read')),

  -- Response
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user ON captain_notification_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_group ON captain_notification_log(group_id, created_at);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_home_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_club_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_notification_log ENABLE ROW LEVEL SECURITY;

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

-- Announcements: Members can view, admins can create/edit
CREATE POLICY club_announcements_select ON captain_club_announcements
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND status = 'approved')
  );

CREATE POLICY club_announcements_insert ON captain_club_announcements
  FOR INSERT WITH CHECK (
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid()) OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY club_announcements_update ON captain_club_announcements
  FOR UPDATE USING (
    author_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid())
  );

CREATE POLICY club_announcements_delete ON captain_club_announcements
  FOR DELETE USING (
    author_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid())
  );

-- Push subscriptions: Users manage their own
CREATE POLICY push_subs_select ON captain_push_subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY push_subs_insert ON captain_push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subs_update ON captain_push_subscriptions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY push_subs_delete ON captain_push_subscriptions
  FOR DELETE USING (user_id = auth.uid());

-- Notification log: Users can see their own notifications
CREATE POLICY notification_log_select ON captain_notification_log
  FOR SELECT USING (user_id = auth.uid());

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

-- Generate unique invite code and club code
CREATE OR REPLACE FUNCTION generate_club_codes()
RETURNS TRIGGER AS $$
DECLARE
  new_club_code TEXT;
  code_exists BOOLEAN;
BEGIN
  -- Generate invite code (8 chars)
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := upper(substr(md5(random()::text), 1, 8));
  END IF;

  -- Generate club code (6 chars, alphanumeric, easy to type)
  IF NEW.club_code IS NULL THEN
    LOOP
      -- Generate a 6-character alphanumeric code (no confusing chars like 0/O, 1/I/L)
      new_club_code := upper(substr(
        translate(encode(gen_random_bytes(4), 'base64'), '+/=0O1IL', ''),
        1, 6
      ));
      -- Check if it exists
      SELECT EXISTS(SELECT 1 FROM captain_home_groups WHERE club_code = new_club_code) INTO code_exists;
      EXIT WHEN NOT code_exists;
    END LOOP;
    NEW.club_code := new_club_code;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_group_invite_code_trigger ON captain_home_groups;
DROP TRIGGER IF EXISTS home_group_codes_trigger ON captain_home_groups;
CREATE TRIGGER home_group_codes_trigger
BEFORE INSERT ON captain_home_groups
FOR EACH ROW EXECUTE FUNCTION generate_club_codes();

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
