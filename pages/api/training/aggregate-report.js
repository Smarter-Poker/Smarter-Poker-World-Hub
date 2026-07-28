/**
 * API: Aggregate Flop Report — Strategy across ALL flop textures
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GET /api/training/aggregate-report
 * 
 * Query params:
 *   gameType: 'hu_cash' | 'cash_6max' | 'mtt_6max_icm' (default: 'hu_cash')
 *   stackDepth: number (default: 100)
 *   heroPosition: 'BTN' | 'CO' | 'SB' | 'BB' | 'UTG' | 'MP' (optional)
 * 
 * Returns aggregated strategy data across all flop textures:
 *   { textures: [...], overall: { cbetFreq, checkFreq, spotCount }, positions: [...] }
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { parseBoardFromHash, extractPositionFromHash, RANK_VALUES, sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
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
// ●●● Flop Texture Classifier ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function classifyFlopTexture(board) {
    if (!board || board.length < 3) return 'unknown';

    const ranks = board.map(c => RANK_VALUES[c?.[0]?.toUpperCase()] || 0).filter(r => r > 0);
    const suits = board.map(c => c?.[1]?.toLowerCase()).filter(Boolean);

    if (ranks.length < 3) return 'unknown';

    const sortedRanks = [...ranks].sort((a, b) => b - a);
    const uniqueSuits = new Set(suits).size;
    const hasPair = sortedRanks[0] === sortedRanks[1] || sortedRanks[1] === sortedRanks[2];
    const hasTrips = sortedRanks[0] === sortedRanks[1] && sortedRanks[1] === sortedRanks[2];
    const highCard = sortedRanks[0];
    const gap1 = sortedRanks[0] - sortedRanks[1];
    const gap2 = sortedRanks[1] - sortedRanks[2];
    const isConnected = gap1 <= 2 && gap2 <= 2;
    const hasBroadway = sortedRanks.some(r => r >= 10);
    const allBroadway = sortedRanks.every(r => r >= 10);

    // Primary classification
    if (hasTrips) return 'trips';
    if (uniqueSuits === 1) return 'monotone';
    if (hasPair && uniqueSuits === 2) return 'paired_two_tone';
    if (hasPair) return 'paired_rainbow';
    if (uniqueSuits === 2 && isConnected) return 'connected_two_tone';
    if (uniqueSuits === 2 && allBroadway) return 'broadway_two_tone';
    if (uniqueSuits === 2) return 'two_tone';
    if (isConnected && hasBroadway) return 'connected_broadway';
    if (isConnected) return 'connected_rainbow';
    if (allBroadway) return 'broadway_rainbow';
    if (highCard >= 14) return 'ace_high_dry';
    if (highCard >= 13) return 'king_high_dry';
    return 'low_dry';
}



// Texture display names and colors
const TEXTURE_META = {
    monotone: { label: 'Monotone', color: '#8b5cf6', icon: '♠♠♠', desc: 'All same suit — flush draws dominate' },
    trips: { label: 'Trips', color: '#ef4444', icon: '◇', desc: 'Three of a kind on board — rare' },
    paired_two_tone: { label: 'Paired Two-Tone', color: '#f97316', icon: '♦♦♠', desc: 'One pair + flush draw possible' },
    paired_rainbow: { label: 'Paired Rainbow', color: '#f59e0b', icon: '◇♦♦', desc: 'One pair, no flush draws' },
    connected_two_tone: { label: 'Connected Two-Tone', color: '#3b82f6', icon: '↗♠♦', desc: 'Straight + flush draws — wet' },
    connected_broadway: { label: 'Connected Broadway', color: '#06b6d4', icon: '↗KQJ', desc: 'High connected cards' },
    connected_rainbow: { label: 'Connected Rainbow', color: '#22c55e', icon: '↗◇', desc: 'Straight draws only' },
    broadway_two_tone: { label: 'Broadway Two-Tone', color: '#a855f7', icon: 'AK♠♦', desc: 'High cards with flush draw' },
    broadway_rainbow: { label: 'Broadway Rainbow', color: '#14b8a6', icon: 'AK◇', desc: 'High cards, dry' },
    two_tone: { label: 'Two-Tone', color: '#64748b', icon: '♠♦', desc: 'Two suits — standard' },
    ace_high_dry: { label: 'Ace-High Dry', color: '#e2e8f0', icon: 'A-x-x', desc: 'Ace high, disconnected' },
    king_high_dry: { label: 'King-High Dry', color: '#cbd5e1', icon: 'K-x-x', desc: 'King high, disconnected' },
    low_dry: { label: 'Low Dry', color: '#94a3b8', icon: '2-5-8', desc: 'Low disconnected rainbow' },
    unknown: { label: 'Other', color: '#475569', icon: '?', desc: '' },
};

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // BUG FIX: No auth — paid solver content exposed without gate
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      try {
          const {
              gameType = 'hu_cash',
              stackDepth = '100',
              heroPosition,
          } = req.query;

          // Cap query to prevent excessively large result sets
          const MAX_SPOTS = 2000;

          // Fetch all spots matching criteria (select only what we need)
          let query = getSupabase()
              .from('solved_spots_gold')
              .select('scenario_hash, strategy_matrix')
              .eq('game_type', gameType)
              .eq('stack_depth', parseInt(stackDepth, 10))
              .limit(MAX_SPOTS);

          if (heroPosition) {
              const safeHeroPos = sanitizeParam(heroPosition, 10);
              if (safeHeroPos) query = query.ilike('scenario_hash', `%_${safeHeroPos}_%`);
          }

          const { data: spots, error } = await query;

          if (error) {
              console.warn('[AggregateReport] Query error:', error);
              return res.status(500).json({ success: false, error: 'Database query failed' });
          }

          // Aggregate by texture
          const textureAgg = {};
          let totalSpots = 0;
          let totalCbet = 0;
          let totalCheck = 0;
          const positionAgg = {};

          (spots || []).forEach(spot => {
              const board = parseBoardFromHash(spot.scenario_hash);
              if (board.length < 3) return;

              const texture = classifyFlopTexture(board);
              const position = extractPositionFromHash(spot.scenario_hash);
              const matrix = spot.strategy_matrix || {};
              const actions = matrix.actions || [];
              const frequencies = matrix.frequencies || {};

              // Calculate aggregate action frequencies
              let cbetFreq = 0;
              let checkFreq = 0;
              let raiseFreq = 0;
              let handCount = 0;

              actions.forEach(action => {
                  const freqMap = frequencies[action] || {};
                  const actionLower = action.toLowerCase();
                  const totalFreq = Object.values(freqMap || {}).reduce((sum, f) => sum + (f || 0), 0);
                  const count = Object.keys(freqMap || {}).length || 1;
                  const avgFreq = totalFreq / count;

                  if (actionLower.includes('bet') || actionLower.includes('raise') || actionLower.includes('cbet')) {
                      cbetFreq += avgFreq;
                  } else if (actionLower.includes('check') || actionLower.includes('call')) {
                      checkFreq += avgFreq;
                  }
                  handCount = Math.max(handCount, count);
              });

              // Normalize
              const total = cbetFreq + checkFreq;
              if (total > 0) {
                  cbetFreq = (cbetFreq / total) * 100;
                  checkFreq = (checkFreq / total) * 100;
              }

              // Accumulate per texture
              if (!textureAgg[texture]) {
                  textureAgg[texture] = { spotCount: 0, cbetSum: 0, checkSum: 0, raiseSum: 0 };
              }
              textureAgg[texture].spotCount += 1;
              textureAgg[texture].cbetSum += cbetFreq;
              textureAgg[texture].checkSum += checkFreq;

              // Accumulate per position
              if (!positionAgg[position]) {
                  positionAgg[position] = { spotCount: 0, cbetSum: 0, checkSum: 0 };
              }
              positionAgg[position].spotCount += 1;
              positionAgg[position].cbetSum += cbetFreq;
              positionAgg[position].checkSum += checkFreq;

              totalSpots += 1;
              totalCbet += cbetFreq;
              totalCheck += checkFreq;
          });

          // Build texture breakdown
          const textures = Object.entries(textureAgg || {})
              .map(([key, data]) => ({
                  texture: key,
                  ...(TEXTURE_META[key] || TEXTURE_META.unknown),
                  spotCount: data.spotCount,
                  cbetFreq: data.spotCount > 0 ? Math.round(data.cbetSum / data.spotCount) : 0,
                  checkFreq: data.spotCount > 0 ? Math.round(data.checkSum / data.spotCount) : 0,
              }))
              .sort((a, b) => b.spotCount - a.spotCount);

          // Build position breakdown
          const positions = Object.entries(positionAgg || {})
              .map(([pos, data]) => ({
                  position: pos,
                  spotCount: data.spotCount,
                  cbetFreq: data.spotCount > 0 ? Math.round(data.cbetSum / data.spotCount) : 0,
                  checkFreq: data.spotCount > 0 ? Math.round(data.checkSum / data.spotCount) : 0,
              }))
              .sort((a, b) => b.spotCount - a.spotCount);

          return res.status(200).json({
              success: true,
              report: {
                  gameType,
                  stackDepth: parseInt(stackDepth, 10),
                  heroPosition: heroPosition || 'ALL',
                  totalSpots,
                  overall: {
                      cbetFreq: totalSpots > 0 ? Math.round(totalCbet / totalSpots) : 0,
                      checkFreq: totalSpots > 0 ? Math.round(totalCheck / totalSpots) : 0,
                  },
                  textures,
                  positions,
                  textureMeta: TEXTURE_META,
              },
          });

      } catch (err) {
          console.warn('[AggregateReport] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
