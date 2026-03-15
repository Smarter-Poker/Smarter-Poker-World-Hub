/**
 * API: Grade Range — Compare user-constructed range to GTO solution
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/training/grade-range
 *
 * Body:
 *   {
 *     gameType: 'cash_6max',
 *     stackDepth: 100,
 *     position: 'BTN',
 *     scenario: 'rfi',
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
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getAllHands, getCombos, VALID_POSITIONS, VALID_SCENARIOS, withTiming } from '../../../src/utils/trainingApiUtils';

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
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
import { GTO_RFI_RANGES as GTO_RFI } from '../../../src/config/gtoRangeData';


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
          const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const { position = 'BTN', scenario = 'rfi', selectedHands = [] } = req.body;

          if (!Array.isArray(selectedHands)) {
              return res.status(400).json({ success: false, error: 'selectedHands must be an array' });
          }

          // Input validation
          if (!VALID_SCENARIOS.includes(scenario)) {
              return res.status(400).json({ success: false, error: 'Invalid scenario type' });
          }

          const pos = VALID_POSITIONS.includes(position.toUpperCase()) ? position.toUpperCase() : 'BTN';
          const gtoRange = GTO_RFI[pos] || GTO_RFI['BTN'];
          const allHands = getAllHands();
          const userSet = new Set(selectedHands.map(h => h.toUpperCase ? h : h));

          // ─── Classify each hand ────────────────────────────────────────
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
                  mixedCount: Object.keys(mixed).length,
              },
          });

      } catch (err) {
          console.error('[GradeRange] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
