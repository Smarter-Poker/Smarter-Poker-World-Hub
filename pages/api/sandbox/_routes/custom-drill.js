/**
 * GET /api/sandbox/custom-drill
 * W6-3: Fetches training_questions filtered by custom parameters (street, hero_position).
 *
 * Response contract (QuickSpotDrill.jsx):
 *   { success: true, pool: [...], questions: [...] }  — both keys hold the same rows.
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

/**
 * Largest drill a caller may request. This is deliberately the same 20 the two
 * clients enforce — CustomDrillBuilder's HAND_COUNTS tops out at 20 and
 * QuickSpotDrill clamps the pool it keeps to 20 — so the server cap is not a
 * silent lie about what a caller can actually receive. Raising it here alone is
 * inert: raise all three together or not at all.
 * Over-limit requests are clamped rather than rejected so an over-eager client
 * still gets a usable pool.
 */
const MAX_DRILL_LIMIT = 20;

/** Unbiased shuffle — sort(() => 0.5 - Math.random()) is not uniform. */
function shuffle(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.read || { max: 60, windowMs: 60_000 })) return;

      if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

      try {
          const supabase = getSupabase();
          const { street, position, limit } = req.query;

          // parseInt('abc') is NaN — slice(0, NaN) silently returns [].
          // Upper bound is 50 (the drill builder's longest set); the 200-row
          // candidate window below still comfortably covers it.
          const n = Math.min(Math.max(parseInt(limit, 10) || 10, 1), MAX_DRILL_LIMIT);

          let query = supabase
              .from('training_questions')
              .select('id, context, question_type, metadata, correct_answer')
              .eq('status', 'active');

          // Apply filters
          if (street && street !== 'Any') {
              query = query.ilike('metadata->>street', `${String(street).slice(0, 20)}%`);
          }
          if (position && position !== 'Any') {
              query = query.ilike('metadata->>hero_position', `${String(position).slice(0, 20)}%`);
          }

          // Random sampling from a bounded candidate window, not the whole table.
          const { data, error } = await query.limit(200);
          if (error) {
              if (error.code === '42P01') {
                  return res.status(200).json({ success: true, pool: [], questions: [] });
              }
              throw error;
          }

          const pool = shuffle(data || []).slice(0, n);

          // `pool` is what QuickSpotDrill reads; `questions` kept for parity with
          // the training route's response shape.
          return res.status(200).json({ success: true, pool, questions: pool });
      } catch (err) {
          console.warn('[custom-drill] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
