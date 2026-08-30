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
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { MIN_VERIFIED_QUESTIONS, sealDrillBatch } from '../../../../src/lib/personal-assistant/drillTelemetry';
import { leakToDrill } from '../../../../src/lib/sandbox/leakReview';
import { isVerifiedSolverQuestion, solverDecisionGroupKey } from '../../../../src/lib/training/solverDecisionEvidence';

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
const LEAK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}$/;

async function loadOwnedLeak(supabase, userId, leakId) {
    const sources = [
        {
            table: 'user_leaks',
            columns: 'id, leak_category, leak_type, situation_class, source_system, recommended_drill, avg_ev_loss_bb, occurrence_count, detector_managed, status, is_active',
            map: (row) => ({
                leakCategory: row.leak_category,
                leakType: row.leak_type,
                situationClass: row.situation_class,
                sourceSystem: row.source_system,
                recommendedDrill: row.recommended_drill,
                avgEvLoss: row.avg_ev_loss_bb,
                occurrenceCount: row.occurrence_count,
                detectorManaged: row.detector_managed === true,
                status: row.status,
                isActive: row.is_active,
            }),
        },
        {
            table: 'user_training_leaks',
            columns: 'id, leak_type, leak_name, description, recommended_drill, count',
            map: (row) => ({
                leakCategory: row.leak_type,
                leakType: row.leak_type,
                situationClass: row.leak_name || row.description,
                sourceSystem: 'training_accountant',
                recommendedDrill: row.recommended_drill,
                occurrenceCount: row.count,
            }),
        },
    ];
    for (const source of sources) {
        const { data, error } = await supabase
            .from(source.table)
            .select(source.columns)
            .eq('user_id', userId)
            .eq('id', leakId)
            .maybeSingle();
        if (!error && data) return { drill: source.map(data), sourceTable: source.table };
        if (error && !['42P01', '22P02', 'PGRST205'].includes(error.code)) {
            console.warn(`[custom-drill] ${source.table} ownership check failed:`, error.message);
            return null;
        }
    }
    return null;
}

function isRewardEligibleLeak(owned) {
    const leak = owned?.drill;
    return owned?.sourceTable === 'user_leaks'
        && leak?.detectorManaged === true
        && leak?.isActive !== false
        && leak?.status !== 'resolved'
        && leak?.sourceSystem === 'solver_engine'
        && /^solver_(training|club_arena)_/.test(String(leak?.leakType || ''));
}

function matchesExactSolverScope(question, leak) {
    if (!isVerifiedSolverQuestion(question)) return false;
    const type = String(leak?.leakType || '');
    const evidenceScope = type.startsWith('solver_club_arena_') ? 'club_arena' : 'training';
    const scenario = question?.scenario || {};
    return solverDecisionGroupKey({
        evidenceScope,
        gameId: leak?.recommendedDrill,
        street: scenario.street,
        position: scenario.heroPosition || scenario.position,
        spotType: scenario.spotType || scenario.nodeType || scenario.potType || question?.spotType,
    }) === type;
}

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
          const { street, position, game, limit } = req.query;
          const rawLeakId = Array.isArray(req.query.leak) ? req.query.leak[0] : req.query.leak;
          const leakId = typeof rawLeakId === 'string' ? rawLeakId.trim() : '';
          let drillUserId = null;
          let ownedDrillParams = null;
          if (leakId) {
              if (!LEAK_ID_RE.test(leakId)) return res.status(400).json({ success: false, error: 'Invalid leak id' });
              const { user, error: authError } = await getServerUserWithFallback(req, supabase);
              if (authError || !user) return res.status(401).json({ success: false, error: 'Authentication required' });
              const ownedLeak = await loadOwnedLeak(supabase, user.id, leakId);
              if (!ownedLeak) {
                  return res.status(404).json({ success: false, error: 'Leak not found' });
              }
              ownedDrillParams = leakToDrill(ownedLeak.drill);
              if (!ownedDrillParams) {
                  return res.status(422).json({ success: false, error: 'This leak has no deterministic drill mapping' });
              }
              drillUserId = user.id;
              ownedDrillParams.rewardEligible = isRewardEligibleLeak(ownedLeak);
              ownedDrillParams.leak = ownedLeak.drill;
          }

          // parseInt('abc') is NaN — slice(0, NaN) silently returns [].
          // Upper bound is 50 (the drill builder's longest set); the 200-row
          // candidate window below still comfortably covers it.
          const n = Math.min(Math.max(parseInt(ownedDrillParams?.limit ?? limit, 10) || 10, 1), MAX_DRILL_LIMIT);
          const effectiveStreet = ownedDrillParams?.street ?? street;
          const effectivePosition = ownedDrillParams?.position ?? position;
          const effectiveGame = ownedDrillParams?.game ?? game;

          // Apply filters. Stored values are lowercase ("flop", "BTN") while
          // the builder sends "Flop"/"BTN" — ilike is case-insensitive.
          // A solver leak knows which Training Arena game produced it. Keep
          // that identity through the review handoff instead of serving an
          // unrelated question that only shares street and position.
          const gameId = String(Array.isArray(effectiveGame) ? effectiveGame[0] : (effectiveGame || '')).trim().toLowerCase();
          const buildQuery = () => {
              let query = supabase.from('training_question_cache').select('id, question_data');
              if (effectiveStreet && effectiveStreet !== 'Any') {
                  query = query.ilike('question_data->scenario->>street', `${String(effectiveStreet).slice(0, 20)}%`);
              }
              if (effectivePosition && effectivePosition !== 'Any') {
                  query = query.ilike('question_data->scenario->>heroPosition', `${String(effectivePosition).slice(0, 20)}%`);
              }
              if (gameId && /^[a-z0-9][a-z0-9-]{1,64}$/.test(gameId)) query = query.eq('game_id', gameId);
              return query.order('id', { ascending: true });
          };

          // Page deterministically until the exact shared solver scope has
          // enough rows or the documented 2,000-candidate safety bound ends.
          const mappedRows = [];
          const PAGE_SIZE = 200;
          for (let from = 0; from < 2000 && mappedRows.length < n; from += PAGE_SIZE) {
              const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
              if (error) {
                  if (error.code === '42P01') {
                      return res.status(200).json({ success: true, pool: [], questions: [] });
                  }
                  throw error;
              }
              const page = data || [];
              mappedRows.push(...page
                  .filter((row) => (
                      !ownedDrillParams?.rewardEligible || matchesExactSolverScope(row.question_data, ownedDrillParams.leak)
                  ))
                  .map(mapCacheRow)
                  .filter(Boolean));
              if (page.length < PAGE_SIZE) break;
          }

          const pool = shuffle(mappedRows).slice(0, n);

          if (ownedDrillParams?.rewardEligible && pool.length < MIN_VERIFIED_QUESTIONS) {
              return res.status(422).json({
                  success: false,
                  error: 'This solver leak does not yet have enough exact verified spots for a corrective attempt.',
                  reason: 'insufficient_verified_questions',
                  required: MIN_VERIFIED_QUESTIONS,
                  available: pool.length,
              });
          }

          // `pool` is what QuickSpotDrill reads; `questions` kept for parity with
          // the training route's response shape.
          const drillToken = drillUserId && ownedDrillParams?.rewardEligible
              ? sealDrillBatch({ leakId, questionIds: pool.map((row) => row.id) }, drillUserId)
              : null;
          if (ownedDrillParams?.rewardEligible && !drillToken) {
              throw new Error('Verified drill signing is unavailable');
          }
          // Verified question keys remain private until an answer is atomically
          // locked. Practice-only drills preserve the legacy immediate-grading
          // payload but can never close a detector signal or unlock a reward.
          const publicPool = drillToken
              ? pool.map(({ correct_answer: _answer, gto_explanation: _explanation, ...row }) => ({ ...row, answer_locked: true }))
              : pool;
          return res.status(200).json({
              success: true,
              pool: publicPool,
              questions: publicPool,
              drillToken,
              serverVerified: Boolean(drillToken),
          });
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
