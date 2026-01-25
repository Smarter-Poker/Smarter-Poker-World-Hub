/**
 * GET /api/assistant/archetypes
 * Returns the 10 canonical villain archetypes
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const DEFAULT_ARCHETYPES = [
  { id: 'gto_neutral', name: 'GTO Neutral', description: 'Balanced, solver-like play', color: '#6b7280', bluff_frequency: 'balanced' },
  { id: 'tight_passive', name: 'Tight Passive', description: 'Nitty, cautious, rarely bluffs', color: '#3b82f6', bluff_frequency: 'low' },
  { id: 'loose_passive', name: 'Calling Station', description: 'Calls too much, passive', color: '#22c55e', bluff_frequency: 'very_low' },
  { id: 'tight_aggressive', name: 'Tight Agg', description: 'Solid, standard winning player', color: '#f59e0b', bluff_frequency: 'moderate' },
  { id: 'loose_aggressive', name: 'LAG', description: 'Wide range, lots of pressure', color: '#ef4444', bluff_frequency: 'high' },
  { id: 'over_bluffer', name: 'Over-Bluffer', description: 'Bluffs too frequently', color: '#ec4899', bluff_frequency: 'very_high' },
  { id: 'under_bluffer', name: 'Under-Bluffer', description: 'Value-heavy, not enough bluffs', color: '#8b5cf6', bluff_frequency: 'very_low' },
  { id: 'fit_or_fold', name: 'Fit-or-Fold', description: 'Continues only with strong hands', color: '#64748b', bluff_frequency: 'very_low' },
  { id: 'icm_scared', name: 'ICM-Scared', description: 'Risk-averse near money', color: '#0ea5e9', bluff_frequency: 'low' },
  { id: 'icm_pressure', name: 'ICM-Pressure', description: 'Exploits ICM fear', color: '#dc2626', bluff_frequency: 'high' },
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data: archetypes, error } = await supabase
      .from('villain_archetypes')
      .select('*')
      .order('id');

    if (error || !archetypes || archetypes.length === 0) {
      return res.status(200).json({
        success: true,
        archetypes: DEFAULT_ARCHETYPES
      });
    }

    // Transform to match frontend format
    const formatted = archetypes.map(a => ({
      id: a.id,
      name: a.display_name,
      description: a.description,
      color: a.color,
      bluff_frequency: a.bluff_frequency
    }));

    return res.status(200).json({
      success: true,
      archetypes: formatted
    });

  } catch (error) {
    console.error('Archetypes error:', error);
    return res.status(200).json({
      success: true,
      archetypes: DEFAULT_ARCHETYPES
    });
  }
}
