import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * API: Preflop Ranges — Browse GTO Preflop Charts
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GET /api/training/preflop-ranges
 *
 * Query params:
 *   gameType: 'cash_6max' | 'mtt' | 'spins' (default: cash_6max)
 *   stackDepth: number (default: 100)
 *   position: 'UTG' | 'MP' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB'
 *   scenario: 'rfi' | 'vs3bet' | 'bb_defense' | 'push_fold' | '4bet' | 'squeeze' | 'cold_call'
 *   vsPosition: optional villain position for 3bet/bb_defense/cold_call/squeeze spots
 *
 * Returns:
 *   { success, range: { actions, gridData, stats, ... } }
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getAllHands, getCombos, VALID_POSITIONS, VALID_SCENARIOS, withTiming } from '../../../src/utils/trainingApiUtils';
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
import { RFI, BB_DEFENSE, FOUR_BET, COLD_CALL, SQUEEZE, getHandFrequencies, getRFIByDepth } from '../../../src/config/solverRanges';


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

        const combos = getCombos(hand);
        const weightedCombos = combos * freq;

        const isPair = hand.length === 2;
        const isSuited = hand.endsWith('s');

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
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'GET only' });
      }

      try {
          // Auth check
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const {
              gameType = 'cash_6max',
              stackDepth = '100',
              position = 'BTN',
              scenario = 'rfi',
              vsPosition = '',
          } = req.query;

          // Input validation
          if (!VALID_SCENARIOS.includes(scenario)) {
              return res.status(400).json({ success: false, error: 'Invalid scenario type' });
          }

          const pos = VALID_POSITIONS.includes(position.toUpperCase()) ? position.toUpperCase() : 'BTN';
          const vsPos = vsPosition ? vsPosition.toUpperCase() : '';
          const allHands = getAllHands();
          let rangeData = {};
          let actions = [];
          let source = 'solver_ranges';
          let spotLabel = '';

          /**
           * Helper: convert solver spot data → API grid format
           * Maps { raise: 0.85, call: 0.10 } → { 'Raise': 85.0, 'Call': 10.0, 'Fold': 5.0 }
           * percentages are rounded to 1 decimal.
           */
          function buildGridFromSpot(spotData, actionLabels) {
              allHands.forEach(hand => {
                  const freq = getHandFrequencies(spotData, hand);
                  const hasAction = (freq.raise > 0.005) || (freq.call > 0.005);
                  if (hasAction) {
                      const entry = {};
                      actionLabels.forEach(({ key, solverKey }) => {
                          entry[key] = Math.round(freq[solverKey] * 1000) / 10;
                      });
                      rangeData[hand] = entry;
                  } else {
                      rangeData[hand] = null;
                  }
              });
          }

          // ●●● RFI Ranges ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
          if (scenario === 'rfi') {
              const sd = parseInt(stackDepth, 10) || 100;
              const spotData = getRFIByDepth(sd, pos);
              if (!spotData) {
                  return res.status(400).json({ success: false, error: `No RFI data for position ${pos}` });
              }
              actions = ['Raise', 'Fold'];
              spotLabel = `${pos} RFI (${sd}BB)`;
              allHands.forEach(hand => {
                  const freq = getHandFrequencies(spotData, hand);
                  rangeData[hand] = freq.raise > 0.005
                      ? { 'Raise': Math.round(freq.raise * 1000) / 10, 'Fold': Math.round(freq.fold * 1000) / 10 }
                      : null;
              });
          }

          // ●●● Vs 3-Bet (4-Bet / Call / Fold facing a 3bet) ●●●●●●●●●●●●●
          else if (scenario === 'vs3bet' || scenario === '4bet') {
              // Look up FOUR_BET spot: e.g. UTG_vs_3bet, CO_vs_3bet, BTN_vs_3bet
              const spotKey = `${pos}_vs_3bet`;
              const spotData = FOUR_BET[spotKey];
              if (!spotData) {
                  // Fallback: try closest available spot
                  const fallbackKey = Object.keys(FOUR_BET || {}).find(k => k.startsWith(pos)) || 'BTN_vs_3bet';
                  const fbData = FOUR_BET[fallbackKey] || {};
                  actions = ['4-Bet', 'Call', 'Fold'];
                  spotLabel = `${pos} vs 3-Bet (${fallbackKey})`;
                  buildGridFromSpot(fbData, [
                      { key: '4-Bet', solverKey: 'raise' },
                      { key: 'Call', solverKey: 'call' },
                      { key: 'Fold', solverKey: 'fold' },
                  ]);
              } else {
                  actions = ['4-Bet', 'Call', 'Fold'];
                  spotLabel = `${pos} vs 3-Bet`;
                  buildGridFromSpot(spotData, [
                      { key: '4-Bet', solverKey: 'raise' },
                      { key: 'Call', solverKey: 'call' },
                      { key: 'Fold', solverKey: 'fold' },
                  ]);
              }
          }

          // ●●● BB Defense ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
          else if (scenario === 'bb_defense') {
              // BB defense vs opener — uses vsPosition or falls back to vs_BTN
              const defKey = vsPos ? `vs_${vsPos}` : (pos === 'BB' ? 'vs_BTN' : `vs_${pos}`);
              const spotData = BB_DEFENSE[defKey] || BB_DEFENSE['vs_BTN'];
              actions = ['3-Bet', 'Call', 'Fold'];
              spotLabel = `BB Defense ${defKey.replace('_', ' ')}`;
              buildGridFromSpot(spotData, [
                  { key: '3-Bet', solverKey: 'raise' },
                  { key: 'Call', solverKey: 'call' },
                  { key: 'Fold', solverKey: 'fold' },
              ]);
          }

          // ●●● 3-Bet Ranges (IP/OOP 3-bet vs opener) ●●●●●●●●●●●●●●●●●●●●
          // Note: separate from vs3bet (which is the opener's response TO a 3bet)
          // This uses THREE_BET data: BTN_vs_UTG, SB_vs_CO, BB_vs_BTN, etc.
          // Accessed when frontend queries scenario=vs3bet with a specific vsPosition
          // or via the new expanded spot picker

          // ●●● Cold Call ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
          else if (scenario === 'cold_call') {
              // Cold call spots: CO_vs_UTG, BTN_vs_UTG, BTN_vs_CO, SB_vs_BTN
              const ccKey = vsPos ? `${pos}_vs_${vsPos}` : Object.keys(COLD_CALL || {}).find(k => k.startsWith(pos)) || 'BTN_vs_CO';
              const spotData = COLD_CALL[ccKey];
              if (!spotData) {
                  return res.status(400).json({ success: false, error: `No cold-call data for ${ccKey}` });
              }
              actions = ['Call', 'Fold'];
              spotLabel = `${ccKey.replace(/_/g, ' ')} Cold Call`;
              allHands.forEach(hand => {
                  const freq = getHandFrequencies(spotData, hand);
                  rangeData[hand] = freq.call > 0.005
                      ? { 'Call': Math.round(freq.call * 1000) / 10, 'Fold': Math.round(freq.fold * 1000) / 10 }
                      : null;
              });
          }

          // ●●● Squeeze ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
          else if (scenario === 'squeeze') {
              // Find matching squeeze spot
              const sqzKey = Object.keys(SQUEEZE || {}).find(k => k.startsWith(pos)) || Object.keys(SQUEEZE || {})[0];
              const spotData = SQUEEZE[sqzKey];
              if (!spotData) {
                  return res.status(400).json({ success: false, error: `No squeeze data for ${pos}` });
              }
              actions = ['Squeeze', 'Fold'];
              spotLabel = sqzKey.replace(/_/g, ' ');
              allHands.forEach(hand => {
                  const freq = getHandFrequencies(spotData, hand);
                  rangeData[hand] = freq.raise > 0.005
                      ? { 'Squeeze': Math.round(freq.raise * 1000) / 10, 'Fold': Math.round(freq.fold * 1000) / 10 }
                      : null;
              });
          }

          // ●●● Push/Fold (Short Stack) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
          // 2026-07-19 AUDIT PHASE 2: memory_charts_gold now holds COMPUTED
          // Nash jam/fold equilibria (fictitious play over a Monte-Carlo
          // 169x169 equity matrix; 6-max chipEV, single-overcall model) for
          // UTG/MP/CO/BTN/SB first-in shoves at depths 2-25bb, plus the BB
          // call-vs-SB-jam ranges (villain_action='sb_push'). The old
          // RFI-threshold heuristic remains only as a last-resort fallback.
          else if (scenario === 'push_fold') {
              const sd = parseInt(stackDepth, 10) || 15;
              const isBB = pos === 'BB';
              // Charts exist for UTG/MP/CO/BTN/SB (+BB call); map uncovered seats
              const chartPos = isBB ? 'BB'
                  : ['UTG', 'MP', 'CO', 'BTN', 'SB'].includes(pos) ? pos
                  : pos === 'HJ' || pos === 'MP+1' ? 'MP'
                  : pos === 'UTG+1' ? 'UTG'
                  : 'BTN';
              actions = isBB ? ['Call', 'Fold'] : ['Push', 'Fold'];

              // Fetch nearest-depth Nash chart (pick closest, not arbitrary)
              const { data: chartRows } = await getSupabase()
                  .from('memory_charts_gold')
                  .select('hand_matrix, hero_position, stack_depth')
                  .eq('hero_position', chartPos)
                  .eq('villain_action', isBB ? 'sb_push' : 'fold_to_hero')
                  .eq('game_type', 'Tournament')
                  .gte('stack_depth', Math.max(2, sd - 5))
                  .lte('stack_depth', sd + 5)
                  .limit(20);

              let chart = null;
              (chartRows || []).forEach(row => {
                  if (!chart || Math.abs(row.stack_depth - sd) < Math.abs(chart.stack_depth - sd)) {
                      chart = row;
                  }
              });

              if (chart?.hand_matrix) {
                  const matrix = chart.hand_matrix;
                  const key = isBB ? 'call' : 'push';
                  const actionLabel = isBB ? 'Call' : 'Push';
                  allHands.forEach(hand => {
                      const freq = matrix[hand]?.[key] ?? matrix[hand]?.push ?? 0;
                      rangeData[hand] = freq > 0
                          ? { [actionLabel]: Math.round(freq * 1000) / 10, 'Fold': Math.round((1 - freq) * 1000) / 10 }
                          : null;
                  });
                  source = 'nash_computed';
                  spotLabel = isBB
                      ? `BB Call vs SB Jam ${chart.stack_depth}BB (Nash)`
                      : `${pos} Push/Fold ${chart.stack_depth}BB (Nash)`;
              } else {
                  // Fallback: use RFI data at the appropriate stack depth.
                  // Keys must match `actions` (BB uses Call/Fold labels).
                  const fbAction = isBB ? 'Call' : 'Push';
                  const rfiRange = getRFIByDepth(sd, isBB ? 'BB' : pos) || {};
                  const pushThreshold = sd <= 8 ? 0.4 : sd <= 12 ? 0.3 : sd <= 15 ? 0.25 : 0.2;
                  allHands.forEach(hand => {
                      const freq = getHandFrequencies(rfiRange, hand);
                      if (freq.raise >= pushThreshold) {
                          rangeData[hand] = { [fbAction]: Math.round(freq.raise * 1000) / 10, 'Fold': Math.round(freq.fold * 1000) / 10 };
                      } else {
                          rangeData[hand] = null;
                      }
                  });
                  source = 'derived_from_rfi';
                  spotLabel = `${pos} Push/Fold ${sd}BB (derived)`;
              }
          }

          // ●●● Compute stats ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
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
                  spotLabel,
              },
          });

      } catch (err) {
          console.warn('[PreflopRanges] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
