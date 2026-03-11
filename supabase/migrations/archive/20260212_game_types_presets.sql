-- Club Commander: Game Type Configuration + Room Presets
-- Closes TC parity gaps for Configuration and Setups modules

-- ===================
-- GAME TYPE TEMPLATES
-- ===================
-- Defines the game types available at a venue (NLH, PLO, Limit, etc.)
-- with default stakes, buy-in ranges, rake configs

CREATE TABLE IF NOT EXISTS commander_game_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- 'No Limit Hold''em', 'Pot Limit Omaha', etc.
  short_code TEXT NOT NULL,        -- 'NLH', 'PLO', 'PLO5', 'LHE', 'MIXED', 'STUD'
  stakes TEXT NOT NULL,            -- '1/3', '2/5', '5/10', etc.
  min_buyin INTEGER NOT NULL DEFAULT 100,
  max_buyin INTEGER DEFAULT 0,     -- 0 = no cap
  max_players INTEGER DEFAULT 9,   -- 9 for holdem, 8 for stud, etc.
  rake_type TEXT DEFAULT 'pot',    -- 'pot' (% of pot), 'time' (per-hour), 'none'
  rake_percent DECIMAL(5,2) DEFAULT 5.00,
  rake_cap DECIMAL(10,2) DEFAULT 15.00,
  time_rate DECIMAL(10,2) DEFAULT 0,  -- $/hour for time games
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  color TEXT DEFAULT '#1877F2',    -- Display color on waitlist/displays
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_types_venue ON commander_game_types(venue_id, is_active);

-- ===================
-- ROOM PRESETS
-- ===================
-- Saved room configurations that can be applied with one click
-- e.g. "Friday Night" = 8 NLH 1/3 tables + 2 PLO 1/2 tables + 1 NLH 2/5

CREATE TABLE IF NOT EXISTS commander_room_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- 'Friday Night', 'Tournament Day', 'Slow Monday'
  description TEXT,
  tables JSONB NOT NULL DEFAULT '[]', 
  -- Array of: { game_type_id, game_type_name, stakes, count, min_buyin, max_buyin }
  is_default BOOLEAN DEFAULT false,
  auto_apply_schedule JSONB,      -- Optional: { days: [5,6], start_time: "18:00" }
  created_by UUID,
  last_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_presets_venue ON commander_room_presets(venue_id);

-- ===================
-- SYSTEM AUDIT LOG
-- ===================
-- For the System Information / Activity page

CREATE TABLE IF NOT EXISTS commander_system_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  action TEXT NOT NULL,            -- 'settings_changed', 'preset_applied', 'room_opened', 'room_closed', etc.
  details JSONB DEFAULT '{}',
  performed_by UUID,
  performed_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_log_venue ON commander_system_log(venue_id, created_at DESC);
