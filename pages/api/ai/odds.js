/**
 * Public AI Agent Poker Odds & Equity API
 * GET /api/ai/odds?hands=AhKd,QcQd&board=JhTs2c&game=nlhe&iterations=5000
 * POST /api/ai/odds
 *
 * Fast, stateless Texas Hold'em and Omaha equity calculator endpoint for
 * autonomous agents, LLM tool-calling, and external integrations.
 */
import { calculateEquity } from '../../../src/lib/poker/pokerOddsEngine.js';
import { normalizeCardGroup } from '../../../src/lib/mcp/mcpServer.mjs';

const SITE_ORIGIN = 'https://smarter.poker';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');

  try {
    const params = req.method === 'GET' ? req.query : (req.body || {});
    const game = String(params.game || 'nlhe').toLowerCase();

    // Parse hands
    let rawHands = params.hands;
    if (typeof rawHands === 'string') {
      rawHands = rawHands.includes(';') ? rawHands.split(';') : rawHands.split('|');
      if (rawHands.length === 1 && rawHands[0].includes(',')) {
        // e.g. AhKd,QcQd
        rawHands = rawHands[0].split(',');
      }
    }

    if (!Array.isArray(rawHands) || rawHands.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: hands (provide at least one hand, e.g. hands=AhKd,QcQd).',
      });
    }

    const hands = rawHands.map(normalizeCardGroup).filter((h) => h.length > 0);
    if (hands.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hand card notation. Example: AhKd, QcQd.',
      });
    }

    const board = normalizeCardGroup(params.board);
    const iterations = Math.min(Math.max(parseInt(params.iterations, 10) || 5000, 100), 20000);

    const results = calculateEquity({ game, hands, board, iterations });
    const seats = (Array.isArray(results) ? results : []).map((r, i) => ({
      seat: i === 0 ? 'Hero' : `Villain ${i}`,
      equity_percent: Number(r.equity.toFixed(2)),
      win_percent: Number(((r.wins / (r.total || 1)) * 100).toFixed(2)),
      tie_percent: Number(((r.ties / (r.total || 1)) * 100).toFixed(2)),
      simulated_wins: r.wins,
      simulated_ties: r.ties,
      total_runs: r.total,
    }));

    return res.status(200).json({
      success: true,
      game,
      simulated_iterations: iterations,
      board_cards_count: board.length,
      seats,
      interactive_tool_url: `${SITE_ORIGIN}/tools/poker-odds-calculator`,
      citation: `Calculated by Smarter.Poker Free Odds Engine (${SITE_ORIGIN}/tools/poker-odds-calculator)`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Odds calculation error: ${err.message}`,
    });
  }
}
