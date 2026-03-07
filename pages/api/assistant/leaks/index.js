/**
 * GET /api/assistant/leaks
 * Returns user's detected leaks
 *
 * POST /api/assistant/leaks
 * Creates or updates a leak
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../../src/lib/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  // HARDENED: March 7, 2026 — REMOVED req.query.userId fallback (IDOR vulnerability).
  // userId MUST come from JWT only. The global fetch interceptor auto-injects JWT.
  let userId = null;
  const { status } = req.query;

  // Extract userId from JWT — this is the ONLY trusted source
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (!authError && authUser) {
      userId = authUser.id;
      if (req.body) req.body.userId = authUser.id;
    }
  }

  // Require JWT auth for write operations
  if (req.method !== 'GET' && !userId) {
    return res.status(401).json({ success: false, error: 'Authentication required or invalid token' });
  }

  if (req.method === 'GET') {
    if (!userId) {
      return res.status(200).json({
        success: true,
        leaks: getDemoLeaks('demo-account'),
        isDemo: true
      });
    }

    try {
      // Fetch from legacy user_leaks table
      let legacyLeaks = [];
      try {
        let query = supabase
          .from('user_leaks')
          .select('*')
          .eq('user_id', userId)
          .order('last_detected_at', { ascending: false })
              .limit(100);

        if (status) {
          query = query.eq('status', status)
              .limit(100);
        }

        const { data } = await query;
        legacyLeaks = data || [];
      } catch (e) {
        console.log('No user_leaks table or error:', e.message);
      }

      // Also fetch from new user_training_leaks table (Memory Matrix)
      let trainingLeaks = [];
      try {
        let query = supabase
          .from('user_training_leaks')
          .select('*')
          .eq('user_id', userId)
          .order('detected_at', { ascending: false })
              .limit(100);

        if (status === 'resolved') {
          query = query.not('fixed_at', 'is', null)
              .limit(100);
        } else if (status) {
          query = query.is('fixed_at', null);
        }

        const { data } = await query;
        // Transform to match expected format
        trainingLeaks = (data || []).map(leak => ({
          id: leak.id,
          user_id: leak.user_id,
          leak_type: leak.leak_type,
          leak_category: 'training',
          situation_class: leak.description,
          status: leak.fixed_at ? 'resolved' : 'persistent',
          confidence: leak.count >= 5 ? 'high' : leak.count >= 3 ? 'medium' : 'low',
          avg_ev_loss_bb: 0.10, // Default EV loss
          occurrence_count: leak.count,
          optimal_frequency: 50,
          current_frequency: 50 + (leak.count * 5),
          first_detected_at: leak.detected_at,
          last_detected_at: leak.updated_at || leak.detected_at,
          trend_data: [],
          explanation: leak.description,
          why_leaking_ev: `Detected ${leak.count} times during Memory Matrix training: ${leak.description}`,
          recommended_drill: leak.recommended_drill
        }));
      } catch (e) {
        console.log('No user_training_leaks table or error:', e.message);
      }

      // Combine both sources
      let allLeaks = [...legacyLeaks, ...trainingLeaks];

      // 🏆 SIMULATED LEAKS FOR DANIEL@BEKAVACTRADING.COM (USER #1)
      if (userId === '47965354-0e56-43ef-931c-ddaab82af765') {
        const d = new Date();
        const thirtyDaysAgo = new Date(d.setDate(d.getDate() - 30)).toISOString();
        const sixtyDaysAgo = new Date(d.setDate(d.getDate() - 60)).toISOString();
        const ninetyDaysAgo = new Date(d.setDate(d.getDate() - 90)).toISOString();

        allLeaks = [
          {
            id: 'sim-1',
            user_id: userId,
            leak_type: 'passive_in_3bet_pots',
            leak_category: 'training',
            situation_class: 'OOP 3-Bet Pots vs BTN',
            status: 'persistent',
            confidence: 'high',
            avg_ev_loss_bb: 0.18,
            occurrence_count: 53,
            optimal_frequency: 45,
            current_frequency: 15,
            first_detected_at: thirtyDaysAgo,
            last_detected_at: new Date().toISOString(),
            trend_data: [
              { date: '2025-10', value: 12 },
              { date: '2025-11', value: 14 },
              { date: '2025-12', value: 15 }
            ],
            explanation: "You are playing far too passively out of position in 3-bet pots, particularly against the button. You check-fold too often when you miss the flop, surrendering your equity advantage.",
            why_leaking_ev: "When you 3-bet from the blinds and check-fold most flops, observant regs will start floating you lighter preflop. You need to mix in more check-raises to protect your checking range.",
            recommended_drill: "3-Bet Pot OOP Defend"
          },
          {
            id: 'sim-2',
            user_id: userId,
            leak_type: 'river_value_underbetting',
            leak_category: 'training',
            situation_class: 'IP River Value Bets vs Range Disadvantage',
            status: 'emerging',
            confidence: 'medium',
            avg_ev_loss_bb: 0.12,
            occurrence_count: 28,
            optimal_frequency: 30,
            current_frequency: 8,
            first_detected_at: thirtyDaysAgo,
            last_detected_at: new Date().toISOString(),
            trend_data: [
              { date: '2025-11', value: 5 },
              { date: '2025-12', value: 8 }
            ],
            explanation: "You consistently size down your value bets on the river when you have a polarized advantage. You bet 33% instead of 75-100% pot with strong value.",
            why_leaking_ev: "Failing to use geometric bet sizing to push chips into the center geometrically caps your win-rate against calling stations who would pay off a pot-sized bet.",
            recommended_drill: "River Sizing Sandbox"
          },
          {
            id: 'sim-3',
            user_id: userId,
            leak_type: 'cbetting_too_frequently',
            leak_category: 'training',
            situation_class: 'IP PFR vs Big Blind on Dynamic Boards',
            status: 'improving',
            confidence: 'high',
            avg_ev_loss_bb: 0.09,
            occurrence_count: 85,
            optimal_frequency: 45,
            current_frequency: 68,
            first_detected_at: sixtyDaysAgo,
            last_detected_at: new Date().toISOString(),
            trend_data: [
              { date: '2025-10', value: 85 },
              { date: '2025-11', value: 75 },
              { date: '2025-12', value: 68 }
            ],
            explanation: "You c-bet too frequently on coordinated/dynamic flops where the Big Blind has a significant range and nut advantage.",
            why_leaking_ev: "C-betting your entire range on boards favoring the defender exposes you to check-raises, forcing you to over-fold hands with equity.",
            recommended_drill: "Dynamic Flop Hand Reading"
          },
          {
            id: 'sim-4',
            user_id: userId,
            leak_type: 'overfolding_to_river_probes',
            leak_category: 'training',
            situation_class: 'OOP Checked Turn vs River Probe',
            status: 'persistent',
            confidence: 'high',
            avg_ev_loss_bb: 0.22,
            occurrence_count: 41,
            optimal_frequency: 55,
            current_frequency: 78,
            first_detected_at: ninetyDaysAgo,
            last_detected_at: new Date().toISOString(),
            trend_data: [
              { date: '2025-09', value: 80 },
              { date: '2025-10', value: 78 },
              { date: '2025-11', value: 76 },
              { date: '2025-12', value: 78 }
            ],
            explanation: "When you check back the turn, you are over-folding to small-to-medium probe bets on the river. Your check-back range is too weak and unprotected.",
            why_leaking_ev: "Aggressive opponents auto-profit by firing any two cards on the river against your turn weakness.",
            recommended_drill: "Turn Check-Back Construction"
          },
          {
            id: 'sim-5',
            user_id: userId,
            leak_type: 'defending_too_wide_vs_3bet',
            leak_category: 'training',
            situation_class: 'UTG/HJ Open vs CO/BTN 3-Bet',
            status: 'resolved',
            confidence: 'medium',
            avg_ev_loss_bb: 0.14,
            occurrence_count: 18,
            optimal_frequency: 22,
            current_frequency: 20,
            first_detected_at: ninetyDaysAgo,
            last_detected_at: thirtyDaysAgo,
            trend_data: [
              { date: '2025-08', value: 35 },
              { date: '2025-09', value: 30 },
              { date: '2025-10', value: 20 }
            ],
            explanation: "You used to call 3-bets too wide linearly, getting dominated postflop by hands like AQ, AK, JJ+.",
            why_leaking_ev: "Calling unsuited broadways OOP against a tight 3-bet range bleeds massive EV.",
            recommended_drill: "Preflop 3-Bet Defense Matrix"
          }
        ];
      }

      // If no leaks found, return demo data
      if (allLeaks.length === 0) {
        return res.status(200).json({
          success: true,
          leaks: getDemoLeaks(userId),
          isDemo: true
        });
      }

      return res.status(200).json({
        success: true,
        leaks: allLeaks,
        isDemo: userId !== '47965354-0e56-43ef-931c-ddaab82af765' && allLeaks.length === 3 // Rough approximation
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
      return res.status(400).json({ success: false, error: 'user_id required' });
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
      return res.status(400).json({ success: false, error: 'id required' });
    }

    try {
      const { data, error } = await supabase
        .from('user_leaks')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // 🚀 NEW BUG #12 FIX: Sync Global PA Stats on Status Change
      if (updates.status && data.user_id) {
        const { data: updatedLeaks } = await supabase
          .from('user_leaks')
          .select('status')
          .eq('user_id', data.user_id);

        const activeLeaks = updatedLeaks?.filter(l => l.status !== 'resolved').length || 0;
        const resolvedLeaksCount = updatedLeaks?.filter(l => l.status === 'resolved').length || 0;

        await supabase
          .from('user_assistant_stats')
          .upsert({
            user_id: data.user_id,
            active_leaks_count: activeLeaks,
            resolved_leaks_count: resolvedLeaksCount,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
      }

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

  return res.status(405).json({ success: false, error: 'Method not allowed' });
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
