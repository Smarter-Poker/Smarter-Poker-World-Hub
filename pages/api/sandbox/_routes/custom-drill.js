/**
 * GET /api/sandbox/custom-drill
 * W6-3: Fetches drill questions filtered by custom parameters (street, position).
 *
 * Source of truth is `training_question_cache` (27k+ rows in production), NOT
 * `training_questions` (0 rows — querying it made every custom drill empty and
 * broke the spaced-repetition review loop). The payload lives in the
 * `question_data` jsonb: street/position under `question_data->scenario`,
 * options as [{ id, text }], and `correctAnswer` holding an option *id* while
 * the client (QuickSpotDrill.mapDrillRow → ensureAnswerable) matches the
 * correct answer against option *text*. mapCacheRow below resolves all of that
 * server-side into the mapped pool shape the client already understands.
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

/**
 * Maps a training_question_cache row to the pool shape QuickSpotDrill expects:
 * { id, scenario_text, hero_hand, hero_position, street, options, correct_answer, gto_explanation }
 *
 * Options arrive as [{ id, text, frequency? }] and `correctAnswer` is the
 * option id (e.g. "b16" or "d"). The client repairs any question whose
 * correct_answer isn't among its option texts by splicing the raw value in as
 * a new option — so resolving id → text here is correctness, not cosmetics.
 * Returns null for rows that can't produce an answerable question; the caller
 * filters those out rather than shipping a guaranteed-wrong drill.
 */
function mapCacheRow(row) {
    const qd = row && row.question_data;
    if (!qd || typeof qd !== 'object') return null;

    const scen = (qd.scenario && typeof qd.scenario === 'object') ? qd.scenario : {};
    const rawOptions = Array.isArray(qd.options) ? qd.options : [];
    const optionTexts = rawOptions
        .map((o) => (o && typeof o === 'object' ? o.text : o))
        .map((o) => (o == null ? '' : String(o).trim()))
        .filter(Boolean);
    if (optionTexts.length < 2) return null;

    const answerId = qd.correctAnswer == null ? '' : String(qd.correctAnswer).trim();
    const answerFromId = rawOptions.find(
        (o) => o && typeof o === 'object' && String(o.id).trim().toLowerCase() === answerId.toLowerCase()
    );
    const correctAnswer = (qd.correctAnswerText && String(qd.correctAnswerText).trim())
        || (answerFromId && answerFromId.text ? String(answerFromId.text).trim() : '')
        || answerId;
    if (!correctAnswer) return null;

    return {
        id: row.id ?? null,
        scenario_text: qd.question || scen.context || scen.title || 'What is the GTO play here?',
        hero_hand: qd.heroHand || scen.heroHand || null,
        hero_position: scen.heroPosition || null,
        street: scen.street || null,
        options: optionTexts,
        correct_answer: correctAnswer,
        gto_explanation: qd.explanation || null,
    };
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
              .from('training_question_cache')
              .select('id, question_data');

          // Apply filters. Stored values are lowercase ("flop", "BTN") while
          // the builder sends "Flop"/"BTN" — ilike is case-insensitive, and a
          // filter on a null jsonb path excludes the row, which correctly
          // drops SCENARIO (psychology) rows from street/position drills.
          if (street && street !== 'Any') {
              query = query.ilike('question_data->scenario->>street', `${String(street).slice(0, 20)}%`);
          }
          if (position && position !== 'Any') {
              query = query.ilike('question_data->scenario->>heroPosition', `${String(position).slice(0, 20)}%`);
          }

          // Random sampling from a bounded candidate window, not the whole table.
          const { data, error } = await query.limit(200);
          if (error) {
              if (error.code === '42P01') {
                  return res.status(200).json({ success: true, pool: [], questions: [] });
              }
              throw error;
          }

          const pool = shuffle((data || []).map(mapCacheRow).filter(Boolean)).slice(0, n);

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
