-- ═══════════════════════════════════════════════════════════
-- CLUB ARENA: Tournament Tables
-- ═══════════════════════════════════════════════════════════

-- 1. Tournament definitions
CREATE TABLE IF NOT EXISTS club_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'mtt' CHECK (type IN ('mtt', 'sng', 'spin', 'xmtt')),
  variant TEXT NOT NULL DEFAULT 'nlh',
  buy_in NUMERIC(12,2) NOT NULL DEFAULT 100,
  starting_chips INTEGER NOT NULL DEFAULT 10000,
  max_players INTEGER NOT NULL DEFAULT 100,
  blind_structure JSONB NOT NULL DEFAULT '[]',
  late_reg_levels INTEGER DEFAULT 6,
  rebuy_enabled BOOLEAN DEFAULT false,
  rebuy_levels INTEGER DEFAULT 0,
  rebuy_cost NUMERIC(12,2) DEFAULT 0,
  addon_enabled BOOLEAN DEFAULT false,
  addon_cost NUMERIC(12,2) DEFAULT 0,
  addon_chips INTEGER DEFAULT 0,
  guaranteed_prize NUMERIC(12,2) DEFAULT 0,
  prize_pool NUMERIC(12,2) DEFAULT 0,
  scheduled_start TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'registering', 'running', 'paused',
                       'final_table', 'complete', 'cancelled')),
  registered_count INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 0,
  engine_id TEXT, -- Engine TournamentController ID
  results JSONB, -- Final standings + payouts
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_tournaments_club ON club_tournaments(club_id);
CREATE INDEX IF NOT EXISTS idx_club_tournaments_status ON club_tournaments(status);

-- 2. Tournament registrations
CREATE TABLE IF NOT EXISTS tournament_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES club_tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  buy_in_amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'playing', 'eliminated', 'unregistered', 'refunded')),
  finish_position INTEGER,
  payout_amount NUMERIC(12,2) DEFAULT 0,
  rebuys_used INTEGER DEFAULT 0,
  addon_used BOOLEAN DEFAULT false,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  eliminated_at TIMESTAMPTZ,
  UNIQUE(tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_regs_tournament ON tournament_registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_regs_user ON tournament_registrations(user_id);

-- 3. RPC: Get tournament details with registration status
CREATE OR REPLACE FUNCTION get_tournament_details(
  p_tournament_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tourn RECORD;
  v_reg RECORD;
  v_registrations JSONB;
BEGIN
  SELECT * INTO v_tourn FROM club_tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- Get user's registration if any
  IF p_user_id IS NOT NULL THEN
    SELECT * INTO v_reg
    FROM tournament_registrations
    WHERE tournament_id = p_tournament_id AND user_id = p_user_id AND status = 'registered';
  END IF;

  -- Get top registrations (for display)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', tr.user_id,
    'status', tr.status,
    'registered_at', tr.registered_at,
    'finish_position', tr.finish_position,
    'payout_amount', tr.payout_amount
  ) ORDER BY tr.registered_at), '[]'::jsonb)
  INTO v_registrations
  FROM tournament_registrations tr
  WHERE tr.tournament_id = p_tournament_id AND tr.status IN ('registered', 'playing', 'eliminated');

  RETURN jsonb_build_object(
    'success', true,
    'tournament', jsonb_build_object(
      'id', v_tourn.id,
      'club_id', v_tourn.club_id,
      'name', v_tourn.name,
      'type', v_tourn.type,
      'variant', v_tourn.variant,
      'buy_in', v_tourn.buy_in,
      'starting_chips', v_tourn.starting_chips,
      'max_players', v_tourn.max_players,
      'blind_structure', v_tourn.blind_structure,
      'late_reg_levels', v_tourn.late_reg_levels,
      'rebuy_enabled', v_tourn.rebuy_enabled,
      'addon_enabled', v_tourn.addon_enabled,
      'guaranteed_prize', v_tourn.guaranteed_prize,
      'prize_pool', v_tourn.prize_pool,
      'scheduled_start', v_tourn.scheduled_start,
      'started_at', v_tourn.started_at,
      'status', v_tourn.status,
      'registered_count', v_tourn.registered_count,
      'current_level', v_tourn.current_level,
      'results', v_tourn.results
    ),
    'is_registered', v_reg.id IS NOT NULL,
    'registrations', v_registrations
  );
END;
$$;

SELECT 'Tournament tables created' AS result;
