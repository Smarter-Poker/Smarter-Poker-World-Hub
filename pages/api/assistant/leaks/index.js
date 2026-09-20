import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
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
import { reportApiError } from '../../../../src/lib/apiErrorHandler';
import { availabilityFailure, persistedResult } from '../../../../src/lib/personal-assistant/persistenceContract';
import { leakStatusPersistenceFields, leakTypeSlug, normalizeUserLeakRow, toUserLeakPersistenceRow } from '../../../../src/lib/personal-assistant/leakRecord';
import { readLeakStatsAggregate } from '../../../../src/lib/personal-assistant/leakStats';

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
  'leak_type', 'leak_category', 'situation_class',
  'explanation', 'why_leaking_ev',
];

// Columns a client is allowed to update via PATCH.
const PATCH_ALLOWED_FIELDS = ['status', 'notes'];
const PATCH_STATUSES = new Set(['emerging', 'persistent', 'improving', 'resolved']);
const TEXT_LIMITS = {
  leak_type: 160,
  leak_category: 80,
  situation_class: 240,
  explanation: 4000,
  why_leaking_ev: 4000,
  notes: 4000,
};

function boundedText(value, field, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new TypeError(`${field} required`);
    return undefined;
  }
  if (typeof value !== 'string') throw new TypeError(`${field} must be text`);
  const normalized = value.trim();
  if (required && !normalized) throw new TypeError(`${field} required`);
  if (normalized.length > TEXT_LIMITS[field]) throw new RangeError(`${field} is too long`);
  return normalized;
}

async function readPaged(buildQuery, { pageSize = 500, maxRows = 5000 } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(maxRows, from + pageSize) - 1;
    let result;
    try {
      result = await buildQuery(from, to);
    } catch (error) {
      return { data: rows, error, complete: false };
    }
    if (result?.error) return { data: rows, error: result.error, complete: false };
    const page = Array.isArray(result?.data) ? result.data : [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null, complete: true };
  }
  return { data: rows, error: null, complete: false };
}

async function readCombinedLeakCounts(userId) {
  const { data, error } = await readLeakStatsAggregate(getSupabase(), userId);
  if (error) return { error };
  return {
    active: data.activeLeaks,
    resolved: data.resolvedLeaks,
    error: null,
  };
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }
    if (req.method === 'GET') {
      if (!applyRateLimit(req, res, LIMITS.read || { max: 60, windowMs: 60000 })) return;
    }

    // HARDENED: March 7, 2026 · REMOVED req.query.userId fallback (IDOR vulnerability).
    // userId MUST come from JWT only. The global fetch interceptor auto-injects JWT.
    let userId = null;
    const { status } = req.query;
    if (status && !PATCH_STATUSES.has(String(status).trim().toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Unsupported leak status' });
    }

    // Extract userId from JWT · this is the ONLY trusted source
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
      if (authErr || !authUser) {
        // A token was presented but is invalid/expired · tell the client to
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
        // Genuinely anonymous request · demo showcase only
        return res.status(200).json({
          success: true,
          leaks: getDemoLeaks('demo-account'),
          isDemo: true
        });
      }

      try {
        const startedAt = Date.now();
        const failedSources = [];
        const truncatedSources = [];

        // These sources are independent. Reading them serially made a cold
        // Leak Finder request pay both PostgREST round trips and occasionally
        // cross the serverless response budget even for a small leak queue.
        const [legacyResult, trainingResult] = await Promise.all([
          readPaged((from, to) => {
            let query = getSupabase()
              .from('user_leaks')
              .select('*')
              .eq('user_id', userId)
              .order('last_detected_at', { ascending: false })
              .order('id', { ascending: false });
            if (status) query = query.eq('status', status);
            return query.range(from, to);
          }),
          readPaged((from, to) => {
            let query = getSupabase()
              .from('user_training_leaks')
              .select('*')
              .eq('user_id', userId)
              .order('detected_at', { ascending: false })
              .order('id', { ascending: false });
            if (status === 'resolved') {
              query = query.not('fixed_at', 'is', null);
            } else if (status) {
              query = query.is('fixed_at', null);
            }
            return query.range(from, to);
          }),
        ]);

        if (legacyResult.error) {
          console.warn('user_leaks query failed:', legacyResult.error.message);
          failedSources.push('user_leaks');
        }
        if (!legacyResult.complete) truncatedSources.push('user_leaks');
        const legacyLeaks = (legacyResult.data || []).map(normalizeUserLeakRow);

        if (trainingResult.error) {
          console.warn('user_training_leaks query failed:', trainingResult.error.message);
          failedSources.push('user_training_leaks');
        }
        if (!trainingResult.complete) truncatedSources.push('user_training_leaks');
        let trainingLeaks = (trainingResult.data || []).map(leak => normalizeUserLeakRow({
            id: leak.id,
            user_id: leak.user_id,
            leak_type: leak.leak_type,
            leak_category: 'training',
            situation_class: leak.description,
            status: leak.fixed_at ? 'resolved' : 'persistent',
            confidence: leak.count >= 5 ? 'high' : leak.count >= 3 ? 'medium' : 'low',
            // Memory Matrix records repetition counts, not per-action EV or a
            // denominator of strategic opportunities. Keep it explicitly
            // unpriced instead of inventing 0.10 BB and a 50% baseline.
            avg_ev_loss_bb: null,
            ev_loss_measured: false,
            occurrence_count: leak.count,
            optimal_frequency: null,
            current_frequency: null,
            frequency_is_estimated: false,
            first_detected_at: leak.detected_at,
            last_detected_at: leak.updated_at || leak.detected_at,
            trend_data: [],
            explanation: leak.description,
            why_leaking_ev: `Detected ${leak.count} times during Memory Matrix training. No per-action EV measurement is available for this training signal.`,
            recommended_drill: leak.recommended_drill
        }));

        // Apply the same exact status filter used for legacy rows so the two
        // sources don't contradict a ?status= request.
        if (status) {
          trainingLeaks = trainingLeaks.filter(l => l.status === status);
        }

        res.setHeader('Server-Timing', `leak-history;dur=${Date.now() - startedAt}`);
        res.setHeader('Cache-Control', 'private, no-store');

        // Combine both sources
        const allLeaks = [...legacyLeaks, ...trainingLeaks];
        if (failedSources.length === 2) {
          return res.status(503).json(availabilityFailure(
            'Leak history is temporarily unavailable.',
            undefined,
            { failedSources },
          ));
        }
        const partialFlags = failedSources.length > 0 || truncatedSources.length > 0
          ? { partial: true, failedSources, truncatedSources }
          : {};

        // No real leaks: return an explicit empty state. Demo leaks are
        // provided separately (clearly labeled) so the frontend can render
        // an onboarding view · never presented as the user's own data.
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
          error: 'Leak history could not be loaded.'
        });
      }
    }


    if (req.method === 'POST') {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};

      // Build the row from a whitelist · ownership is forced from the JWT,
      // client-supplied user_id / id are ignored
      const leak = { user_id: userId };
      try {
        POST_ALLOWED_FIELDS.forEach(field => {
          const value = boundedText(body[field], field, { required: field === 'leak_type' });
          if (value !== undefined) leak[field] = value;
        });
      } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
      const reportedType = leakTypeSlug(leak.leak_type);
      if (!reportedType) {
        return res.status(400).json({ success: false, error: 'leak_type must include letters or numbers' });
      }
      // This public endpoint records a user's observation, not deterministic
      // solver proof. Never let client-supplied confidence, frequencies, or EV
      // enter the measured Leak Finder aggregate.
      Object.assign(leak, {
        leak_type: `user_reported_${reportedType}`.slice(0, 180),
        status: 'emerging',
        source_system: 'user_reported',
        confidence: 'low',
        avg_ev_loss_bb: null,
        ev_loss_measured: false,
        occurrence_count: 1,
        optimal_frequency: null,
        current_frequency: null,
        trend_data: [],
      });
      leak.last_detected_at = new Date().toISOString();
      const persistenceRow = toUserLeakPersistenceRow(leak, { userId });

      try {
        let { data, error } = await getSupabase()
          .from('user_leaks')
          .upsert(persistenceRow, { onConflict: 'user_id,leak_type' })
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
              .update({ ...persistenceRow, updated_at: new Date().toISOString() })
              .eq('id', existing.id)
              .eq('user_id', userId)
              .select()
              .maybeSingle());
          } else {
            ({ data, error } = await getSupabase()
              .from('user_leaks')
              .insert(persistenceRow)
              .select()
              .maybeSingle());
          }

          if (error) throw error;
        }

        const normalized = normalizeUserLeakRow(data);
        return res.status(200).json(persistedResult(normalized, { leak: normalized }));

      } catch (error) {
        console.warn('Save leak error:', error);
        return res.status(500).json({
          success: false,
          error: 'The leak report could not be saved.'
        });
      }
    }

    if (req.method === 'PATCH') {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const { id } = body;

      if (!id) {
        return res.status(400).json({ success: false, error: 'id required' });
      }

      // Whitelist updatable fields · never allow user_id/id reassignment
      const updates = {};
      PATCH_ALLOWED_FIELDS.forEach(field => {
        if (body[field] !== undefined) updates[field] = body[field];
      });
      if (updates.notes !== undefined) {
        try {
          updates.notes = boundedText(updates.notes, 'notes');
        } catch (error) {
          return res.status(400).json({ success: false, error: error.message });
        }
      }
      if (updates.status !== undefined) {
        updates.status = String(updates.status).trim().toLowerCase();
        if (!PATCH_STATUSES.has(updates.status)) {
          return res.status(400).json({ success: false, error: 'Unsupported leak status' });
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No updatable fields provided' });
      }

      try {
        const now = new Date().toISOString();
        if (updates.status) Object.assign(updates, leakStatusPersistenceFields(updates.status, {
          now,
          resolutionSource: updates.status === 'resolved' ? 'manual' : null,
        }));

        // Ownership enforced: only rows belonging to the JWT user can change
        let { data, error } = await getSupabase()
          .from('user_leaks')
          .update({ ...updates, updated_at: now })
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .maybeSingle();

        if (error) {
          // Invalid UUID (e.g. a demo/simulated id) · treat as not found
          if (error.code === '22P02') {
            return res.status(404).json({ success: false, error: 'Leak not found' });
          }
          throw error;
        }

        let updatedSource = 'user_leaks';
        if (!data) {
          // The page combines user_leaks with Memory Matrix's
          // user_training_leaks. Status controls must therefore transition the
          // owned row in whichever source produced the card.
          if (!updates.status) return res.status(404).json({ success: false, error: 'Leak not found' });
          const trainingResult = await getSupabase()
            .from('user_training_leaks')
            .update({ fixed_at: updates.status === 'resolved' ? updates.resolved_at : null, updated_at: now })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .maybeSingle();
          if (trainingResult.error) {
            if (trainingResult.error.code === '22P02') return res.status(404).json({ success: false, error: 'Leak not found' });
            throw trainingResult.error;
          }
          if (!trainingResult.data) return res.status(404).json({ success: false, error: 'Leak not found' });
          const trainingLeak = trainingResult.data;
          data = normalizeUserLeakRow({
            ...trainingLeak,
            leak_category: 'training',
            situation_class: trainingLeak.description || trainingLeak.leak_name,
            status: trainingLeak.fixed_at ? 'resolved' : 'persistent',
            occurrence_count: trainingLeak.count,
            first_detected_at: trainingLeak.detected_at,
            last_detected_at: trainingLeak.updated_at || trainingLeak.detected_at,
            recommended_drill: trainingLeak.recommended_drill,
            source_system: 'training_arena',
          });
          updatedSource = 'user_training_leaks';
        }

        // 🚀 NEW BUG #12 FIX: Sync Global PA Stats on Status Change
        let statsSynced = true;
        if (updates.status) {
          const counts = await readCombinedLeakCounts(userId);
          if (counts.error) {
            statsSynced = false;
            console.warn('[Supabase] Refusing to overwrite assistant leak counts after recount failed:', counts.error.message);
          } else {
            const { error: statsWriteError } = await getSupabase()
              .from('user_assistant_stats')
              .upsert({
                user_id: userId,
                active_leaks_count: counts.active,
                resolved_leaks_count: counts.resolved,
                updated_at: now,
              }, { onConflict: 'user_id' });
            if (statsWriteError) {
              statsSynced = false;
              console.warn('[Supabase] Secondary stats sync failed in user_assistant_stats:', statsWriteError.message);
            }
          }
        }

        const normalized = normalizeUserLeakRow(data);
        return res.status(200).json(persistedResult(normalized, {
          leak: normalized,
          source: updatedSource,
          partial: !statsSynced,
          statsSynced,
        }));

      } catch (error) {
        console.warn('Update leak error:', error);
        return res.status(500).json({
          success: false,
          error: 'The leak could not be updated.'
        });
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ─── Demo data helpers ────────────────────────────────────────────────────────────

// Last `n` consecutive YYYY-MM month labels ending with the current month ·
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
// labeling · never presented as the user's own play data)
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
