/**
 * Public AI Agent Preflop Ranges API
 * GET /api/ai/preflop?position=UTG
 *
 * Provides solver-verified 6-Max 100BB GTO opening frequencies for AI agents.
 */
import { RFI } from '../../../src/config/solverRanges.js';

const SITE_ORIGIN = 'https://smarter.poker';
const VALID_POSITIONS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800');

  try {
    const rawPos = String(req.query.position || req.query.pos || 'UTG').trim().toUpperCase();
    const position = VALID_POSITIONS.includes(rawPos) ? rawPos : 'UTG';

    const rfiMap = RFI[position] || RFI.UTG;
    const hands = Object.entries(rfiMap).map(([hand, actions]) => ({
      hand,
      raise_frequency: Number(actions.raise) || 0,
      call_frequency: Number(actions.call) || 0,
    }));

    const openedHands = hands.filter((h) => h.raise_frequency > 0);

    return res.status(200).json({
      success: true,
      position,
      game_structure: '6-Max No-Limit Texas Hold\'em 100BB Stack Depth',
      total_hands_opened: openedHands.length,
      hands_in_opening_range: openedHands,
      interactive_matrix_url: `${SITE_ORIGIN}/tools/preflop-ranges/${position.toLowerCase()}`,
      citation: `Smarter.Poker GTO Preflop Range Lab (${SITE_ORIGIN}/tools/preflop-ranges/${position.toLowerCase()})`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Preflop range retrieval error: ${err.message}`,
    });
  }
}
