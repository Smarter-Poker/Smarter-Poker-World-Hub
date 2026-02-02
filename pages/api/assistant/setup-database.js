/**
 * POST /api/assistant/setup-database
 * Creates all Personal Assistant database tables in Supabase
 *
 * Run this once to set up the schema.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const results = [];

  try {
    // 1. Villain Archetypes (Reference table)
    const { error: archetypesError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS villain_archetypes (
          id VARCHAR(30) PRIMARY KEY,
          display_name VARCHAR(50) NOT NULL,
          description TEXT NOT NULL,
          vpip_low DECIMAL(5,2),
          vpip_high DECIMAL(5,2),
          pfr_low DECIMAL(5,2),
          pfr_high DECIMAL(5,2),
          aggression_factor DECIMAL(4,2),
          fold_to_cbet_low DECIMAL(5,2),
          fold_to_cbet_high DECIMAL(5,2),
          bluff_frequency VARCHAR(20) NOT NULL,
          icon VARCHAR(10),
          color VARCHAR(7),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    });

    if (archetypesError) {
      // Try direct insert approach if RPC doesn't exist
      results.push({ table: 'villain_archetypes', status: 'rpc_failed', error: archetypesError.message });
    } else {
      results.push({ table: 'villain_archetypes', status: 'created' });
    }

    // 2. Sandbox Sessions
    const { error: sessionsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS sandbox_sessions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL,
          hero_hand VARCHAR(10) NOT NULL,
          hero_position VARCHAR(10) NOT NULL,
          hero_stack_bb INTEGER NOT NULL,
          game_type VARCHAR(20) NOT NULL,
          num_opponents INTEGER NOT NULL,
          board_flop VARCHAR(10),
          board_turn VARCHAR(5),
          board_river VARCHAR(5),
          villain_config JSONB NOT NULL,
          bet_sizing_preset VARCHAR(20) NOT NULL,
          pot_size_bb DECIMAL(8,2),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_user ON sandbox_sessions(user_id);
      `
    });

    if (sessionsError) {
      results.push({ table: 'sandbox_sessions', status: 'rpc_failed', error: sessionsError.message });
    } else {
      results.push({ table: 'sandbox_sessions', status: 'created' });
    }

    // 3. Sandbox Results
    const { error: resultsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS sandbox_results (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          session_id UUID NOT NULL,
          primary_action VARCHAR(50) NOT NULL,
          primary_frequency DECIMAL(5,2) NOT NULL,
          primary_ev DECIMAL(8,4),
          alternative_actions JSONB,
          data_source VARCHAR(30) NOT NULL,
          confidence VARCHAR(20) NOT NULL,
          sensitivity_flags TEXT[],
          why_not_check TEXT,
          truth_seal JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    });

    if (resultsError) {
      results.push({ table: 'sandbox_results', status: 'rpc_failed', error: resultsError.message });
    } else {
      results.push({ table: 'sandbox_results', status: 'created' });
    }

    // 4. User Leaks
    const { error: leaksError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS user_leaks (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL,
          leak_type VARCHAR(100) NOT NULL,
          leak_category VARCHAR(50) NOT NULL,
          situation_class VARCHAR(100) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'emerging',
          confidence VARCHAR(20) NOT NULL,
          avg_ev_loss_bb DECIMAL(8,4),
          total_ev_loss_bb DECIMAL(10,4),
          occurrence_count INTEGER DEFAULT 1,
          first_detected_at TIMESTAMPTZ DEFAULT NOW(),
          last_detected_at TIMESTAMPTZ DEFAULT NOW(),
          resolved_at TIMESTAMPTZ,
          trend_data JSONB,
          optimal_frequency DECIMAL(5,2),
          current_frequency DECIMAL(5,2),
          explanation TEXT,
          why_leaking_ev TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_user_leaks_user ON user_leaks(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_leaks_status ON user_leaks(user_id, status);
      `
    });

    if (leaksError) {
      results.push({ table: 'user_leaks', status: 'rpc_failed', error: leaksError.message });
    } else {
      results.push({ table: 'user_leaks', status: 'created' });
    }

    // 5. User Assistant Stats
    const { error: statsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS user_assistant_stats (
          user_id UUID PRIMARY KEY,
          total_sessions_reviewed INTEGER DEFAULT 0,
          total_hands_analyzed INTEGER DEFAULT 0,
          active_leaks_count INTEGER DEFAULT 0,
          resolved_leaks_count INTEGER DEFAULT 0,
          total_ev_saved_bb DECIMAL(12,4) DEFAULT 0,
          sandbox_sessions_count INTEGER DEFAULT 0,
          last_sandbox_at TIMESTAMPTZ,
          last_leak_scan_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    });

    if (statsError) {
      results.push({ table: 'user_assistant_stats', status: 'rpc_failed', error: statsError.message });
    } else {
      results.push({ table: 'user_assistant_stats', status: 'created' });
    }

    // Seed villain archetypes
    const archetypes = [
      { id: 'gto_neutral', display_name: 'GTO-Neutral', description: 'Balanced, solver-like play', bluff_frequency: 'balanced', color: '#6b7280' },
      { id: 'tight_passive', display_name: 'Tight-Passive', description: 'Nitty and cautious, rarely bluffs', bluff_frequency: 'low', color: '#3b82f6' },
      { id: 'loose_passive', display_name: 'Calling Station', description: 'Calls too much, passive postflop', bluff_frequency: 'very_low', color: '#22c55e' },
      { id: 'tight_aggressive', display_name: 'TAG', description: 'Solid, standard winning player', bluff_frequency: 'moderate', color: '#f59e0b' },
      { id: 'loose_aggressive', display_name: 'LAG', description: 'Wide range, lots of pressure', bluff_frequency: 'high', color: '#ef4444' },
      { id: 'over_bluffer', display_name: 'Over-Bluffer', description: 'Bluffs too frequently', bluff_frequency: 'very_high', color: '#ec4899' },
      { id: 'under_bluffer', display_name: 'Under-Bluffer', description: 'Value-heavy, not enough bluffs', bluff_frequency: 'very_low', color: '#8b5cf6' },
      { id: 'fit_or_fold', display_name: 'Fit-or-Fold', description: 'Continues only with strong hands', bluff_frequency: 'very_low', color: '#64748b' },
      { id: 'icm_scared', display_name: 'ICM-Scared', description: 'Risk-averse near money', bluff_frequency: 'low', color: '#0ea5e9' },
      { id: 'icm_pressure', display_name: 'ICM-Pressure', description: 'Exploits ICM fear', bluff_frequency: 'high', color: '#dc2626' },
    ];

    const { error: seedError } = await supabase
      .from('villain_archetypes')
      .upsert(archetypes, { onConflict: 'id' });

    if (seedError) {
      results.push({ table: 'villain_archetypes_seed', status: 'failed', error: seedError.message });
    } else {
      results.push({ table: 'villain_archetypes_seed', status: 'seeded', count: archetypes.length });
    }

    return res.status(200).json({
      success: true,
      message: 'Database setup attempted',
      results,
      note: 'If RPC failed, run the SQL directly in Supabase SQL Editor'
    });

  } catch (error) {
    console.error('Setup error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      results
    });
  }
}
