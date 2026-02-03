-- Training Scenarios Table
-- Stores Pio-derived hand timelines + Grok-generated questions for the Training Hand Scenario Player
-- Created: 2026-02-03

CREATE TABLE IF NOT EXISTS training_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Game Reference
  game_id TEXT NOT NULL,
  scenario_type TEXT DEFAULT 'pio_derived', -- 'pio_derived', 'grok_generated', 'manual'
  
  -- Grok-Generated Question Data
  question_text TEXT NOT NULL,
  question_subtext TEXT DEFAULT 'Choose the best action',
  answers JSONB NOT NULL, -- [{label, value, isCorrect, frequency?, evDiff?}]
  
  -- Pio-Derived Timeline Data
  timeline_steps JSONB NOT NULL, -- Array of step objects
  seat_count INTEGER NOT NULL CHECK (seat_count >= 2 AND seat_count <= 9),
  seats JSONB NOT NULL, -- [{seatId, positionLabel, playerName, isHero, startingStackBB}]
  blinds JSONB NOT NULL, -- {sbBB, bbBB, anteBB?}
  hero_cards JSONB, -- ['Ah', 'Kd']
  
  -- Decision Point
  decision_step_index INTEGER NOT NULL,
  
  -- Grok Explanation (optional - only for coaching)
  explanation TEXT,
  gto_approach TEXT,
  ev_analysis JSONB, -- {correctEV, alternatives: [{action, ev, frequency}]}
  alternate_lines JSONB,
  
  -- Caching & Metadata
  cached BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast game lookups
CREATE INDEX IF NOT EXISTS idx_training_scenarios_game_id ON training_scenarios(game_id);
CREATE INDEX IF NOT EXISTS idx_training_scenarios_cached ON training_scenarios(cached) WHERE cached = true;

-- Row Level Security
ALTER TABLE training_scenarios ENABLE ROW LEVEL SECURITY;

-- Everyone can read scenarios (they're shared training content)
CREATE POLICY "Anyone can read training scenarios"
  ON training_scenarios FOR SELECT
  USING (true);

-- Only service role can insert/update (from Grok/Pio pipeline)
CREATE POLICY "Service role can manage scenarios"
  ON training_scenarios FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_training_scenarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER training_scenarios_updated_at
  BEFORE UPDATE ON training_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION update_training_scenarios_updated_at();

-- Add comment
COMMENT ON TABLE training_scenarios IS 'Training scenarios with Pio-derived timelines and Grok-generated questions for the Hand Scenario Player';
