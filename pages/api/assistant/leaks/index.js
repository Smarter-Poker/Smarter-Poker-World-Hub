/**
 * GET /api/assistant/leaks
 * Returns user's detected leaks
 *
 * POST /api/assistant/leaks
 * Creates or updates a leak
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const { userId, status } = req.query;

  if (req.method === 'GET') {
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    try {
      let query = supabase
        .from('user_leaks')
        .select('*')
        .eq('user_id', userId)
        .order('last_detected_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data: leaks, error } = await query;

      if (error) {
        // Table might not exist yet - return demo data
        return res.status(200).json({
          success: true,
          leaks: getDemoLeaks(userId),
          isDemo: true
        });
      }

      // If no leaks found, return demo data
      if (!leaks || leaks.length === 0) {
        return res.status(200).json({
          success: true,
          leaks: getDemoLeaks(userId),
          isDemo: true
        });
      }

      return res.status(200).json({
        success: true,
        leaks,
        isDemo: false
      });

    } catch (error) {
      console.error('Fetch leaks error:', error);
      return res.status(200).json({
        success: true,
        leaks: getDemoLeaks(userId),
        isDemo: true,
        error: error.message
      });
    }
  }

  if (req.method === 'POST') {
    const leak = req.body;

    if (!leak.user_id) {
      return res.status(400).json({ error: 'user_id required' });
    }

    try {
      const { data, error } = await supabase
        .from('user_leaks')
        .upsert(leak, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        leak: data
      });

    } catch (error) {
      console.error('Save leak error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id required' });
    }

    try {
      const { data, error } = await supabase
        .from('user_leaks')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        leak: data
      });

    } catch (error) {
      console.error('Update leak error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Demo leaks for users without real data
function getDemoLeaks(userId) {
  return [
    {
      id: 'demo-1',
      user_id: userId,
      leak_type: 'overfolding_to_cbets',
      leak_category: 'flop',
      situation_class: 'MP vs C-Bet - Single Raised Pots',
      status: 'persistent',
      confidence: 'high',
      avg_ev_loss_bb: 0.14,
      occurrence_count: 47,
      optimal_frequency: 45,
      current_frequency: 62,
      first_detected_at: '2024-02-15T00:00:00Z',
      last_detected_at: new Date().toISOString(),
      trend_data: [
        { date: '2024-02', value: 52 },
        { date: '2024-03', value: 55 },
        { date: '2024-03.5', value: 58 },
        { date: '2024-04', value: 60 },
        { date: '2024-04.5', value: 62 }
      ],
      explanation: "You're folding to c-bets much more often than GTO recommends, especially on dry boards. This makes you easy to exploit and costs you value in missed calls.",
      why_leaking_ev: "When you fold too often to c-bets, aggressive opponents can profitably bluff you with any two cards. You're giving up equity with hands that should be calling."
    },
    {
      id: 'demo-2',
      user_id: userId,
      leak_type: 'lack_of_river_bluffs',
      leak_category: 'river',
      situation_class: 'BB vs River Bet in Single Raised Pots',
      status: 'emerging',
      confidence: 'medium',
      avg_ev_loss_bb: 0.08,
      occurrence_count: 23,
      optimal_frequency: 12,
      current_frequency: 4,
      first_detected_at: '2024-03-20T00:00:00Z',
      last_detected_at: new Date().toISOString(),
      trend_data: [
        { date: '2024-03', value: 3 },
        { date: '2024-04', value: 4 }
      ],
      explanation: "Your river bluff-raise frequency is significantly below optimal. You're leaving value on the table by not applying enough pressure on rivers.",
      why_leaking_ev: "Without enough bluffs in your river raising range, observant opponents can fold all their bluff-catchers against you, knowing you're only raising for value."
    },
    {
      id: 'demo-3',
      user_id: userId,
      leak_type: 'misplaying_3bet_pots',
      leak_category: 'preflop',
      situation_class: 'Cutoff vs Button - 3-Bet Pots',
      status: 'improving',
      confidence: 'medium',
      avg_ev_loss_bb: 0.05,
      occurrence_count: 31,
      optimal_frequency: 35,
      current_frequency: 28,
      first_detected_at: '2024-01-10T00:00:00Z',
      last_detected_at: new Date().toISOString(),
      trend_data: [
        { date: '2024-01', value: 18 },
        { date: '2024-02', value: 22 },
        { date: '2024-03', value: 25 },
        { date: '2024-04', value: 28 }
      ],
      explanation: "Your continuation frequency in 3-bet pots has been too passive, but you're showing improvement. Keep working on finding spots to apply pressure.",
      why_leaking_ev: "In 3-bet pots, aggression is rewarded because ranges are defined. Being too passive allows opponents to realize equity cheaply."
    }
  ];
}
