-- ═══════════════════════════════════════════════════════════════════════════
-- GOD MODE LIBRARY MIGRATION
-- Drops all legacy solved_hands tables and builds the ultimate GTO engine
-- ═══════════════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PURGE: Drop all legacy tables
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP TABLE IF EXISTS solved_hands CASCADE;
DROP TABLE IF EXISTS solved_hands_v2 CASCADE;
DROP TABLE IF EXISTS solved_hands_final CASCADE;
DROP TABLE IF EXISTS gto_solutions CASCADE;
DROP TABLE IF EXISTS preflop_charts CASCADE;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE 1: solved_spots_gold (The Postflop Engine)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE solved_spots_gold (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Scenario Identification (Unique Composite Hash)
    scenario_hash TEXT NOT NULL UNIQUE,
    -- Format: "As7d2h_BTN_vs_BB_40bb_MTT_ICM_Turn"
    -- Ensures no duplicate scenarios
    
    -- Street Classification
    street TEXT NOT NULL CHECK (street IN ('Flop', 'Turn', 'River')),
    -- Critical for sorting and querying by game phase
    
    -- Stack Depth (Indexed for performance)
    stack_depth INTEGER NOT NULL CHECK (stack_depth IN (20, 40, 60, 80, 100, 200)),
    -- Standardized stack sizes in big blinds
    
    -- Game Type
    game_type TEXT NOT NULL CHECK (game_type IN ('Cash', 'MTT', 'Spin')),
    
    -- Table Topology
    topology TEXT NOT NULL CHECK (topology IN ('HU', '3-Max', '6-Max', '9-Max')),
    
    -- Mode (EV Calculation Method)
    mode TEXT NOT NULL CHECK (mode IN ('ChipEV', 'ICM', 'PKO')),
    
    -- Board Cards (Array for easy querying)
    board_cards TEXT[] NOT NULL,
    -- Example: ['As', '7d', '2h'] for flop
    
    -- Macro Metrics (Global State)
    macro_metrics JSONB NOT NULL DEFAULT '{}',
    -- Structure: {
    --   "hero_range_adv": 0.55,
    --   "spr": 3.2,
    --   "nut_adv": 0.12,
    --   "board_texture": "MonoDynamic",
    --   "pot_size": 12.5
    -- }
    
    -- Strategy Matrix (The Master Lookup for all 1,326 hands)
    strategy_matrix JSONB NOT NULL,
    -- Structure: {
    --   "AhKd": {
    --     "best_action": "Raise",
    --     "max_ev": 10.5,
    --     "ev_loss": 0,
    --     "actions": {
    --       "Raise": {"ev": 10.5, "freq": 1.0, "size": "66%"},
    --       "Call": {"ev": 8.2, "freq": 0.0},
    --       "Fold": {"ev": 0.0, "freq": 0.0}
    --     },
    --     "is_mixed": false
    --   },
    --   "QsJh": {
    --     "best_action": "Mixed",
    --     "max_ev": 5.3,
    --     "ev_loss": 0,
    --     "actions": {
    --       "Raise": {"ev": 5.3, "freq": 0.45, "size": "75%"},
    --       "Call": {"ev": 5.2, "freq": 0.55},
    --       "Fold": {"ev": 0.0, "freq": 0.0}
    --     },
    --     "is_mixed": true
    --   }
    -- }
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX idx_solved_spots_street ON solved_spots_gold(street);
CREATE INDEX idx_solved_spots_stack ON solved_spots_gold(stack_depth);
CREATE INDEX idx_solved_spots_game_type ON solved_spots_gold(game_type);
CREATE INDEX idx_solved_spots_topology ON solved_spots_gold(topology);
CREATE INDEX idx_solved_spots_mode ON solved_spots_gold(mode);
CREATE INDEX idx_solved_spots_board ON solved_spots_gold USING GIN(board_cards);
CREATE INDEX idx_solved_spots_macro ON solved_spots_gold USING GIN(macro_metrics);

-- Composite Index for Common Queries
CREATE INDEX idx_solved_spots_lookup ON solved_spots_gold(
    street, stack_depth, game_type, topology, mode
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE 2: memory_charts_gold (The Preflop Engine)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE memory_charts_gold (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Chart Identification
    chart_name TEXT NOT NULL UNIQUE,
    -- Examples: "UTG_Open_100bb_9Max", "BTN_vs_BB_3Bet_40bb_HU"
    
    -- Category
    category TEXT NOT NULL CHECK (category IN ('Preflop', 'PushFold', 'Nash')),
    -- Preflop: Standard opening ranges
    -- PushFold: All-in or fold situations
    -- Nash: Game theory equilibrium ranges
    
    -- Chart Grid (The Master Data)
    chart_grid JSONB NOT NULL,
    -- Structure: {
    --   "AA": {"action": "Raise", "freq": 1.0, "size": "3bb"},
    --   "AKs": {"action": "Raise", "freq": 1.0, "size": "3bb"},
    --   "AKo": {"action": "Raise", "freq": 0.85, "size": "3bb"},
    --   "AQo": {"action": "Mixed", "raise_freq": 0.45, "fold_freq": 0.55},
    --   "72o": {"action": "Fold", "freq": 1.0}
    -- }
    
    -- Metadata
    stack_depth INTEGER,
    topology TEXT,
    position TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for Chart Lookups
CREATE INDEX idx_memory_charts_category ON memory_charts_gold(category);
CREATE INDEX idx_memory_charts_name ON memory_charts_gold(chart_name);
CREATE INDEX idx_memory_charts_grid ON memory_charts_gold USING GIN(chart_grid);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTIONS: Auto-update timestamp
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_solved_spots_gold_updated_at
    BEFORE UPDATE ON solved_spots_gold
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memory_charts_gold_updated_at
    BEFORE UPDATE ON memory_charts_gold
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RLS POLICIES (Optional - Enable if using Row Level Security)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ALTER TABLE solved_spots_gold ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE memory_charts_gold ENABLE ROW LEVEL SECURITY;

-- Public read access (adjust as needed for your security model)
-- CREATE POLICY "Public read access" ON solved_spots_gold FOR SELECT USING (true);
-- CREATE POLICY "Public read access" ON memory_charts_gold FOR SELECT USING (true);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- GRANT PERMISSIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Grant access to authenticated users (adjust roles as needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON solved_spots_gold TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON memory_charts_gold TO authenticated;
GRANT SELECT ON solved_spots_gold TO anon;
GRANT SELECT ON memory_charts_gold TO anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- Tables Created:
-- 1. solved_spots_gold - Postflop GTO solutions with full strategy matrices
-- 2. memory_charts_gold - Preflop/PushFold/Nash equilibrium charts
--
-- Ready for God Mode ingestion via ingest_god_mode.py
-- ═══════════════════════════════════════════════════════════════════════════
