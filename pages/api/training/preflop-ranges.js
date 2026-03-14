/**
 * API: Preflop Ranges — Browse GTO Preflop Charts
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/training/preflop-ranges
 *
 * Query params:
 *   gameType: 'cash_6max' | 'mtt' | 'spins' (default: cash_6max)
 *   stackDepth: number (default: 100)
 *   position: 'UTG' | 'MP' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB'
 *   scenario: 'rfi' | 'vs3bet' | 'bb_defense' | 'push_fold' (default: rfi)
 *
 * Returns:
 *   { success, range: { actions, frequencies, stats } }
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getAllHands } from '../../../src/utils/trainingApiUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);


import { GTO_RFI_RANGES as PREFLOP_RFI_RANGES, VS_3BET_RANGES, BB_DEFENSE_RANGES } from '../../../src/config/gtoRangeData';


/**
 * Compute stats from a frequency map
 */
function computeRangeStats(freqMap) {
    const allHands = getAllHands();
    let totalCombos = 0;
    let pairCombos = 0;
    let suitedCombos = 0;
    let offsuitCombos = 0;
    let mixedHands = 0;
    let pureHands = 0;

    // Combos per hand type: pair=6, suited=4, offsuit=12
    allHands.forEach(hand => {
        const freq = freqMap[hand] || 0;
        if (freq <= 0) return;

        const isPair = hand.length === 2;
        const isSuited = hand.endsWith('s');

        const combos = isPair ? 6 : isSuited ? 4 : 12;
        const weightedCombos = combos * freq;

        totalCombos += weightedCombos;
        if (isPair) pairCombos += weightedCombos;
        else if (isSuited) suitedCombos += weightedCombos;
        else offsuitCombos += weightedCombos;

        if (freq >= 0.95) pureHands++;
        else if (freq > 0.05) mixedHands++;
    });

    const rfiPct = (totalCombos / 1326 * 100).toFixed(1);

    return {
        totalCombos: Math.round(totalCombos),
        maxCombos: 1326,
        rfiPct: parseFloat(rfiPct),
        pairCombos: Math.round(pairCombos),
        suitedCombos: Math.round(suitedCombos),
        offsuitCombos: Math.round(offsuitCombos),
        pureHands,
        mixedHands,
    };
}

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'GET only' });
      }

      try {
          // Auth check
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
          const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const {
              gameType = 'cash_6max',
              stackDepth = '100',
              position = 'BTN',
              scenario = 'rfi',
          } = req.query;

          const pos = position.toUpperCase();
          const allHands = getAllHands();
          let rangeData = {};
          let actions = [];
          let source = 'solver_derived';

          // ─── RFI Ranges ────────────────────────────────────────────────
          if (scenario === 'rfi') {
              const posRange = PREFLOP_RFI_RANGES[pos] || {};
              actions = ['Raise', 'Fold'];
              allHands.forEach(hand => {
                  const raiseFreq = posRange[hand] || 0;
                  rangeData[hand] = raiseFreq > 0
                      ? { 'Raise': Math.round(raiseFreq * 1000) / 10, 'Fold': Math.round((1 - raiseFreq) * 1000) / 10 }
                      : null;
              });
          }

          // ─── Vs 3-Bet ──────────────────────────────────────────────────
          else if (scenario === 'vs3bet') {
              const posRange = VS_3BET_RANGES[pos] || VS_3BET_RANGES['BTN'] || {};
              actions = ['4-Bet', 'Call', 'Fold'];
              allHands.forEach(hand => {
                  const freq = posRange[hand] || 0;
                  if (freq > 0) {
                      // High freq = 4-bet, medium = call, low = fold
                      const fourBetFreq = freq > 0.7 ? freq * 0.6 : freq * 0.3;
                      const callFreq = freq - fourBetFreq;
                      const foldFreq = 1 - freq;
                      rangeData[hand] = {
                          '4-Bet': Math.round(fourBetFreq * 1000) / 10,
                          'Call': Math.round(callFreq * 1000) / 10,
                          'Fold': Math.round(foldFreq * 1000) / 10,
                      };
                  } else {
                      rangeData[hand] = null;
                  }
              });
          }

          // ─── BB Defense ────────────────────────────────────────────────
          else if (scenario === 'bb_defense') {
              // BB defense varies by who opened
              const vsPos = pos === 'BB' ? 'vs_BTN' : `vs_${pos}`;
              const defenseRange = BB_DEFENSE_RANGES[vsPos] || BB_DEFENSE_RANGES['vs_BTN'] || {};
              actions = ['3-Bet', 'Call', 'Fold'];
              allHands.forEach(hand => {
                  const freq = defenseRange[hand] || 0;
                  if (freq > 0) {
                      const threeBetFreq = freq > 0.8 ? freq * 0.4 : freq * 0.15;
                      const callFreq = freq - threeBetFreq;
                      const foldFreq = 1 - freq;
                      rangeData[hand] = {
                          '3-Bet': Math.round(threeBetFreq * 1000) / 10,
                          'Call': Math.round(callFreq * 1000) / 10,
                          'Fold': Math.round(foldFreq * 1000) / 10,
                      };
                  } else {
                      rangeData[hand] = null;
                  }
              });
          }

          // ─── Push/Fold (Short Stack) ───────────────────────────────────
          else if (scenario === 'push_fold') {
              actions = ['Push', 'Fold'];
              const sd = parseInt(stackDepth, 10) || 15;

              // Try loading from memory_charts_gold
              const { data: charts } = await supabase
                  .from('memory_charts_gold')
                  .select('hand_matrix, hero_position, stack_depth')
                  .eq('hero_position', pos)
                  .gte('stack_depth', sd - 3)
                  .lte('stack_depth', sd + 3)
                  .limit(1)
                  .maybeSingle();

              if (charts?.hand_matrix) {
                  const matrix = charts.hand_matrix;
                  allHands.forEach(hand => {
                      const pushFreq = matrix[hand]?.push || 0;
                      rangeData[hand] = pushFreq > 0
                          ? { 'Push': Math.round(pushFreq * 1000) / 10, 'Fold': Math.round((1 - pushFreq) * 1000) / 10 }
                          : null;
                  });
                  source = 'memory_charts_gold';
              } else {
                  // Fallback: generate simplified push/fold based on stack depth
                  const pushThreshold = sd <= 8 ? 0.4 : sd <= 12 ? 0.3 : sd <= 15 ? 0.25 : 0.2;
                  const rfiRange = PREFLOP_RFI_RANGES[pos] || {};
                  allHands.forEach(hand => {
                      const rfiFreq = rfiRange[hand] || 0;
                      if (rfiFreq >= pushThreshold) {
                          rangeData[hand] = { 'Push': Math.round(rfiFreq * 1000) / 10, 'Fold': Math.round((1 - rfiFreq) * 1000) / 10 };
                      } else {
                          rangeData[hand] = null;
                      }
                  });
                  source = 'derived_from_rfi';
              }
          }

          // ─── Compute stats ─────────────────────────────────────────────
          const freqMap = {};
          allHands.forEach(hand => {
              if (rangeData[hand]) {
                  const foldKey = Object.keys(rangeData[hand]).find(k => k === 'Fold');
                  const foldPct = foldKey ? rangeData[hand][foldKey] : 0;
                  freqMap[hand] = (100 - foldPct) / 100;
              }
          });

          const stats = computeRangeStats(freqMap);

          res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=7200');
          return res.status(200).json({
              success: true,
              range: {
                  actions,
                  gridData: rangeData,
                  stats,
                  position: pos,
                  scenario,
                  gameType,
                  stackDepth: parseInt(stackDepth, 10),
                  source,
              },
          });

      } catch (err) {
          console.error('[PreflopRanges] Error:', err);
          return res.status(500).json({ success: false, error: err.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
