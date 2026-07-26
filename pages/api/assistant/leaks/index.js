/**
 * GET /api/assistant/leaks
 * Returns user's detected leaks
 *
 * POST /api/assistant/leaks
 * Creates or updates a leak
 *
 * PATCH /api/assistant/leaks
 * Updates a leak's status/notes (ownership enforced via JWT)
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Columns a client is allowed to supply when creating a leak via POST.
// user_id and id are NEVER accepted from the client (IDOR protection).
const POST_ALLOWED_FIELDS = [
  'leak_type', 'leak_category', 'situation_class', 'status', 'confidence',
  'avg_ev_loss_bb', 'occurrence_count', 'optimal_frequency', 'current_frequency',
  'trend_data', 'explanation', 'why_leaking_ev',
];

// Columns a client is allowed to update via PATCH.
const PATCH_ALLOWED_FIELDS = ['status', 'notes', 'resolved_at'];

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }
    if (req.method === 'GET') {
      if (!applyRateLimit(req, res, LIMITS.read || { max: 60, windowMs: 60000 })) return;
    }

    // HARDENED: March 7, 2026 — REMOVED req.query.userId fallback (IDOR vulnerability).
    // userId MUST come from JWT only. The global fetch interceptor auto-injects JWT.
    let userId = null;
    const { status } = req.query;

    // Extract userId from JWT — this is the ONLY trusted source
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: authData, error: authError } = await getSupabase().auth.getUser(token);
      const authUser = authData?.user;
      if (authError || !authUser) {
        // A token was presented but is invalid/expired — tell the client to
        // refresh instead of silently serving demo data
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }
      userId = authUser.id;
    }

    // Require JWT auth for write operations
    if (req.method !== 'GET' && !userId) {
      return res.status(401).json({ success: false, error: 'Authentication required or invalid token' });
    }

    if (req.method === 'GET') {
      if (!userId) {
        // Genuinely anonymous request — demo showcase only
        return res.status(200).json({
          success: true,
          leaks: getDemoLeaks('demo-account'),
          isDemo: true
        });
      }

      try {
        const failedSources = [];

        // Fetch from legacy user_leaks table
        let legacyLeaks = [];
        {
          let query = getSupabase()
            .from('user_leaks')
            .select('*')
            .eq('user_id', userId)
            .order('last_detected_at', { ascending: false })
            .limit(100);

          if (status) {
            query = query.eq('status', status).limit(100);
          }

          const { data, error } = await query;
          if (error) {
            console.warn('user_leaks query failed:', error.message);
            failedSources.push('user_leaks');
          }
          legacyLeaks = data || [];
        }

        // Also fetch from new user_training_leaks table (Memory Matrix)
        let trainingLeaks = [];
        {
          let query = getSupabase()
            .from('user_training_leaks')
            .select('*')
            .eq('user_id', userId)
            .order('detected_at', { ascending: false })
            .limit(100);

          if (status === 'resolved') {
            query = query.not('fixed_at', 'is', null).limit(100);
          } else if (status) {
            // Coarse prefilter: any non-resolved status implies still active
            query = query.is('fixed_at', null);
          }

          const { data, error } = await query;
          if (error) {
            console.warn('user_training_leaks query failed:', error.message);
            failedSources.push('user_training_leaks');
          }
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
            // Count-based pseudo-frequency, clamped and explicitly flagged as
            // an estimate so the UI can render it differently
            current_frequency: Math.min(95, 50 + (leak.count * 5)),
            frequency_is_estimated: true,
            first_detected_at: leak.detected_at,
            last_detected_at: leak.updated_at || leak.detected_at,
            trend_data: [],
            explanation: leak.description,
            why_leaking_ev: `Detected ${leak.count} times during Memory Matrix training: ${leak.description}`,
            recommended_drill: leak.recommended_drill
          }));

          // Apply the same exact status filter used for legacy rows so the
          // two sources don't contradict a ?status= request
          if (status) {
            trainingLeaks = trainingLeaks.filter(l => l.status === status);
          }
        }

        // Combine both sources
        const allLeaks = [...legacyLeaks, ...trainingLeaks];
        const partialFlags = failedSources.length > 0
          ? { partial: true, failedSources }
          : {};

        // No real leaks: return an explicit empty state. Demo leaks are
        // provided separately (clearly labeled) so the frontend can render
        // an onboarding view — never presented as the user's own data.
        if (allLeaks.length === 0) {
          return res.status(200).json({
            success: true,
            leaks: [],
            isDemo: false,
            demoLeaks: getDemoLeaks(userId),
            ...partialFlags
          });
        }

        return res.status(200).json({
          success: true,
          leaks: allLeaks,
          isDemo: false,
          ...partialFlags
        });

      } catch (error) {
        console.warn('Fetch leaks error:', error);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }


    if (req.method === 'POST') {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};

      if (!body.leak_type) {
        return res.status(400).json({ success: false, error: 'leak_type required' });
      }

      // Build the row from a whitelist — ownership is forced from the JWT,
      // client-supplied user_id / id are ignored
      const leak = { user_id: userId };
      POST_ALLOWED_FIELDS.forEach(field => {
        if (body[field] !== undefined) leak[field] = body[field];
      });
      leak.last_detected_at = new Date().toISOString();

      try {
        let { data, error } = await getSupabase()
          .from('user_leaks')
          .upsert(leak, { onConflict: 'user_id,leak_type' })
          .select()
          .maybeSingle();

        if (error) {
          // Fallback when the (user_id, leak_type) unique index is missing:
          // manual select → update-or-insert, still scoped to this user
          const { data: existing } = await getSupabase()
            .from('user_leaks')
            .select('id')
            .eq('user_id', userId)
            .eq('leak_type', leak.leak_type)
            .maybeSingle();

          if (existing) {
            ({ data, error } = await getSupabase()
              .from('user_leaks')
              .update({ ...leak, updated_at: new Date().toISOString() })
              .eq('id', existing.id)
              .eq('user_id', userId)
              .select()
              .maybeSingle());
          } else {
            ({ data, error } = await getSupabase()
              .from('user_leaks')
              .insert(leak)
              .select()
              .maybeSingle());
          }

          if (error) throw error;
        }

        return res.status(200).json({
          success: true,
          leak: data
        });

      } catch (error) {
        console.warn('Save leak error:', error);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }

    if (req.method === 'PATCH') {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const { id } = body;

      if (!id) {
        return res.status(400).json({ success: false, error: 'id required' });
      }

      // Whitelist updatable fields — never allow user_id/id reassignment
      const updates = {};
      PATCH_ALLOWED_FIELDS.forEach(field => {
        if (body[field] !== undefined) updates[field] = body[field];
      });
      if (updates.status === 'resolved' && updates.resolved_at === undefined) {
        updates.resolved_at = new Date().toISOString();
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No updatable fields provided' });
      }

      try {
        // Ownership enforced: only rows belonging to the JWT user can change
        const { data, error } = await getSupabase()
          .from('user_leaks')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .maybeSingle();

        if (error) {
          // Invalid UUID (e.g. a demo/simulated id) — treat as not found
          if (error.code === '22P02') {
            return res.status(404).json({ success: false, error: 'Leak not found' });
          }
          throw error;
        }

        if (!data) {
          return res.status(404).json({ success: false, error: 'Leak not found' });
        }

        // 🚀 NEW BUG #12 FIX: Sync Global PA Stats on Status Change
        if (updates.status) {
          const { data: updatedLeaks } = await getSupabase()
            .from('user_leaks')
            .select('status')
            .eq('user_id', userId);

          const activeLeaks = updatedLeaks?.filter(l => l.status !== 'resolved').length || 0;
          const resolvedLeaksCount = updatedLeaks?.filter(l => l.status === 'resolved').length || 0;

          const { error: err_user_assistant_stats_s6z72 } = await getSupabase()
            .from('user_assistant_stats')
            .upsert({
              user_id: userId,
              active_leaks_count: activeLeaks,
              resolved_leaks_count: resolvedLeaksCount,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

          if (err_user_assistant_stats_s6z72) console.warn('[Supabase] Silent mutation failed in user_assistant_stats:', err_user_assistant_stats_s6z72.message);
        }

        return res.status(200).json({
          success: true,
          leak: data
        });

      } catch (error) {
        console.warn('Update leak error:', error);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ─── Demo data helpers ──────────────────────────────────────────────────────

// Last `n` consecutive YYYY-MM month labels ending with the current month —
// the exact format detect.js's updateTrendData writes
function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

// Demo leaks for users without real data (always served with isDemo/demoLeaks
// labeling — never presented as the user's own play data)
function getDemoLeaks(userId) {
  const m5 = lastMonths(5);
  const m4 = lastMonths(4);
  const m2 = lastMonths(2);

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
      first_detected_at: daysAgo(120),
      last_detected_at: new Date().toISOString(),
      trend_data: [
        { date: m5[0], value: 52 },
        { date: m5[1], value: 55 },
        { date: m5[2], value: 58 },
        { date: m5[3], value: 60 },
        { date: m5[4], value: 62 }
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
      first_detected_at: daysAgo(45),
      last_detected_at: new Date().toISOString(),
      trend_data: [
        { date: m2[0], value: 3 },
        { date: m2[1], value: 4 }
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
      first_detected_at: daysAgo(150),
      last_detected_at: new Date().toISOString(),
      trend_data: [
        { date: m4[0], value: 18 },
        { date: m4[1], value: 22 },
        { date: m4[2], value: 25 },
        { date: m4[3], value: 28 }
      ],
      explanation: "Your continuation frequency in 3-bet pots has been too passive, but you're showing improvement. Keep working on finding spots to apply pressure.",
      why_leaking_ev: "In 3-bet pots, aggression is rewarded because ranges are defined. Being too passive allows opponents to realize equity cheaply."
    }
  ];
}
