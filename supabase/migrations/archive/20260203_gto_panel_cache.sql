-- GTO Panel Cache Table
-- Stores generated GTO analysis panel images for training scenarios

CREATE TABLE IF NOT EXISTS gto_panel_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id TEXT UNIQUE NOT NULL,
    image_url TEXT NOT NULL,
    action TEXT NOT NULL,
    frequency INTEGER,
    explanation TEXT,
    gto_approach TEXT,
    ev_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_gto_panel_cache_scenario_id 
ON gto_panel_cache(scenario_id);

-- Enable RLS
ALTER TABLE gto_panel_cache ENABLE ROW LEVEL SECURITY;

-- Public read access (panels are public assets)
CREATE POLICY "GTO panels are publicly readable"
ON gto_panel_cache FOR SELECT
USING (true);

-- Service role can insert/update
CREATE POLICY "Service role can manage GTO panels"
ON gto_panel_cache FOR ALL
USING (auth.role() = 'service_role');

-- Comment for documentation
COMMENT ON TABLE gto_panel_cache IS 'Cached GTO analysis panel images for training scenarios';
