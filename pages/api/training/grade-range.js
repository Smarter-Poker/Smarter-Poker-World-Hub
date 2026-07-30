import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * API: Grade Range — Compare user-constructed range to GTO solution
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * POST /api/training/grade-range
 *
 * Body:
 *   {
 *     gameType: 'cash_6max',
 *     stackDepth: 100,
 *     position: 'BTN',
 *     scenario: 'rfi' | 'vs3bet' | '4bet' | 'bb_defense' | 'cold_call' | 'squeeze' | 'push_fold',
 *     vsPosition: 'UTG' (optional, for 3bet/bb_defense/cold_call),
 *     selectedHands: ['AA', 'AKs', 'AKo', ...]  // Hands the user selected
 *   }
 *
 * Returns:
 *   {
 *     success: true,
 *     grade: { letter: 'B+', score: 82, accuracy: 82.5 },
 *     diff: {
 *       correct: ['AA', 'KK', ...],       // User included, GTO also includes
 *       missed: ['A5s', ...],              // GTO includes but user didn't
 *       wrong: ['T7o', ...],               // User included but GTO doesn't
 *       mixed: { hand: { userIncluded, gtoFreq } }
 *     },
 *     stats: { totalGTOCombos, userCombos, overlapCombos }
 *   }
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getAllHands, getCombos, VALID_POSITIONS, VALID_SCENARIOS, withTiming } from '../../../src/utils/trainingApiUtils';
// ●● Phase 4 Engine: Range Grading with category breakdowns + heatmap ●●●●
import { gradeRange, generateHeatmapGrid, generateGradingSummary, HAND_CATEGORIES } from '../../../src/engines/RangeGradingEngine';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
import {
    RFI, BB_DEFENSE, FOUR_BET, COLD_CALL, SQUEEZE, THREE_BET,
    getHandFrequencies, ALL_HANDS as SOLVER_ALL_HANDS, getRFIByDepth,
} from '../../../src/config/solverRanges';

/**
 * Resolve the solver spot data for a given scenario + position + vsPosition.
 * Returns { spotData, flat } where flat = { hand: totalActionFreq }.
 */
function resolveSpotForGrading(scenario, pos, vsPosition, stackDepth) {
    let spotData = null;
    const vsPos = vsPosition ? vsPosition.toUpperCase() : '';

    switch (scenario) {
        case 'rfi': {
            const sd = parseInt(stackDepth, 10) || 100;
            spotData = getRFIByDepth(sd, pos);
            break;
        }
        case 'vs3bet':
        case '4bet': {
            const key = `${pos}_vs_3bet`;
            spotData = FOUR_BET[key] || Object.values(FOUR_BET || {}).find((_, i) =>
                Object.keys(FOUR_BET || {})[i].startsWith(pos)) || FOUR_BET['BTN_vs_3bet'];
            break;
        }
        case 'bb_defense': {
            const defKey = vsPos ? `vs_${vsPos}` : (pos === 'BB' ? 'vs_BTN' : `vs_${pos}`);
            spotData = BB_DEFENSE[defKey] || BB_DEFENSE['vs_BTN'];
            break;
        }
        case 'cold_call': {
            const ccKey = vsPos ? `${pos}_vs_${vsPos}` :
                Object.keys(COLD_CALL || {}).find(k => k.startsWith(pos)) || 'BTN_vs_CO';
            spotData = COLD_CALL[ccKey];
            break;
        }
        case 'squeeze': {
            const sqzKey = Object.keys(SQUEEZE || {}).find(k => k.startsWith(pos)) || Object.keys(SQUEEZE || {})[0];
            spotData = SQUEEZE[sqzKey];
            break;
        }
        case 'push_fold': {
            const sd = parseInt(stackDepth, 10) || 15;
            spotData = getRFIByDepth(sd, pos);
            break;
        }
        default:
            spotData = RFI[pos] || RFI['BTN'];
    }

    if (!spotData) spotData = RFI[pos] || RFI['BTN'];

    // Build flat freq map: hand → totalActionFreq (raise + call)
    const flat = {};
    for (const hand of SOLVER_ALL_HANDS) {
        const f = getHandFrequencies(spotData, hand);
        if (f.raise > 0 || f.call > 0) {
            flat[hand] = f.raise + f.call;
        }
    }
    return { spotData, flat };
}


/**
 * Calculate letter grade from numeric score
 */
function getLetterGrade(score) {
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 67) return 'D+';
    if (score >= 63) return 'D';
    if (score >= 60) return 'D-';
    return 'F';
}

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'POST only' });
      }

      // Body size guard — selectedHands array is bounded to 169 hands max
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 10240) {
          return res.status(413).json({ success: false, error: 'Request body too large' });
      }

      try {
          // Auth check
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const { position = 'BTN', scenario = 'rfi', selectedHands = [], vsPosition = '', stackDepth = 100 } = req.body;

          if (!Array.isArray(selectedHands)) {
              return res.status(400).json({ success: false, error: 'selectedHands must be an array' });
          }

          // Input validation
          if (!VALID_SCENARIOS.includes(scenario)) {
              return res.status(400).json({ success: false, error: 'Invalid scenario type' });
          }

          const pos = VALID_POSITIONS.includes(position.toUpperCase()) ? position.toUpperCase() : 'BTN';
          const { flat: gtoRange } = resolveSpotForGrading(scenario, pos, vsPosition, stackDepth);
          const allHands = getAllHands();
          const userSet = new Set(selectedHands.map(h => h.toUpperCase ? h : h));

          // ●●● Classify each hand ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
          const correct = [];    // User included, GTO freq >= 0.5
          const missed = [];     // GTO freq >= 0.5, user didn't include
          const wrong = [];      // User included, GTO freq < 0.1 (definitely not in range)
          const mixed = {};      // User included but GTO has partial frequency

          let totalGTOCombos = 0;
          let userCombos = 0;
          let overlapCombos = 0;
          let weightedScore = 0;
          let totalWeight = 0;

          allHands.forEach(hand => {
              const gtoFreq = gtoRange[hand] || 0;
              const userIncluded = userSet.has(hand);
              const combos = getCombos(hand);

              if (gtoFreq >= 0.5) totalGTOCombos += combos;
              if (userIncluded) userCombos += combos;

              // Weight by combos — offsuit hands (12 combos) matter more
              const weight = combos;
              totalWeight += weight;

              if (userIncluded && gtoFreq >= 0.5) {
                  // Correct: user included a hand that GTO includes
                  correct.push(hand);
                  overlapCombos += combos;
                  weightedScore += weight * 1.0;
              } else if (!userIncluded && gtoFreq < 0.1) {
                  // Correct: user correctly excluded a hand GTO doesn't play
                  weightedScore += weight * 1.0;
              } else if (userIncluded && gtoFreq < 0.1) {
                  // Wrong: user included a hand that's clearly not in GTO range
                  wrong.push(hand);
                  weightedScore += weight * 0;
              } else if (!userIncluded && gtoFreq >= 0.5) {
                  // Missed: user forgot a hand that's in GTO range
                  missed.push(hand);
                  weightedScore += weight * 0;
              } else if (userIncluded && gtoFreq >= 0.1 && gtoFreq < 0.5) {
                  // Partially correct: user included a mixed hand (GTO plays it sometimes)
                  mixed[hand] = { userIncluded: true, gtoFreq };
                  weightedScore += weight * gtoFreq; // Partial credit
              } else if (!userIncluded && gtoFreq >= 0.1 && gtoFreq < 0.5) {
                  // Partially correct: user excluded a mixed hand (acceptable)
                  mixed[hand] = { userIncluded: false, gtoFreq };
                  weightedScore += weight * (1 - gtoFreq); // Partial credit for not including
              }
          });

          const score = totalWeight > 0 ? Math.round(weightedScore / totalWeight * 100) : 0;
          const accuracy = totalGTOCombos > 0 ? Math.round(overlapCombos / totalGTOCombos * 1000) / 10 : 0;

          // Build grid diff for visual display
          const gridDiff = {};
          allHands.forEach(hand => {
              const gtoFreq = gtoRange[hand] || 0;
              const userIncluded = userSet.has(hand);

              if (userIncluded && gtoFreq >= 0.5) {
                  gridDiff[hand] = 'correct';     // Green
              } else if (userIncluded && gtoFreq < 0.1) {
                  gridDiff[hand] = 'wrong';        // Red
              } else if (!userIncluded && gtoFreq >= 0.5) {
                  gridDiff[hand] = 'missed';       // Yellow
              } else if (userIncluded && gtoFreq >= 0.1) {
                  gridDiff[hand] = 'partial';      // Orange (mixed)
              } else {
                  gridDiff[hand] = 'neutral';      // Gray (correctly excluded)
              }
          });

          // ●● Engine enrichment: category breakdowns + heatmap ●●●●●●●●
          let engineData = {};
          try {
              // Build player range object for engine (hand → action)
              const playerRange = {};
              allHands.forEach(h => { playerRange[h] = userSet.has(h) ? 'raise' : 'fold'; });
              // Build solver range object (hand → action based on freq)
              const solverRange = {};
              allHands.forEach(h => {
                  const freq = gtoRange[h] || 0;
                  solverRange[h] = freq >= 0.5 ? 'raise' : freq >= 0.1 ? 'mixed' : 'fold';
              });
              const engineResult = gradeRange(playerRange, solverRange, gtoRange, { mode: 'binary' });
              const heatmap = generateHeatmapGrid(playerRange, solverRange, gtoRange);
              const summary = generateGradingSummary(engineResult);
              engineData = {
                  categoryScores: engineResult?.categoryScores || {},
                  heatmap: heatmap || [],
                  summary: summary || {},
                  deviations: (engineResult?.deviations || []).slice(0, 20), // Top 20 deviations
              };
          } catch (e) {
              console.warn('[GradeRange] Engine enrichment failed:', e.message);
          }

          return res.status(200).json({
              success: true,
              grade: {
                  letter: getLetterGrade(score),
                  score,
                  accuracy,
              },
              diff: {
                  correct,
                  missed,
                  wrong,
                  mixed,
                  gridDiff,
              },
              stats: {
                  totalGTOCombos,
                  userCombos,
                  overlapCombos,
                  totalHands: allHands.length,
                  correctCount: correct.length,
                  missedCount: missed.length,
                  wrongCount: wrong.length,
                  mixedCount: Object.keys(mixed || {}).length,
              },
              ...engineData,
          });

      } catch (err) {
          console.warn('[GradeRange] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
