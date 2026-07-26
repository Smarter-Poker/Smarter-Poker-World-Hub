/**
 * Weekly Spot Challenge API
 * GET: Returns the current week's challenge scenario
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import { getTodayCST } from '../../../../src/lib/trivia/getTodayCST';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}





// Fallback curated spots when no DB entries exist yet
const CURATED_SPOTS = [
    {
        id: 'week_default_1',
        scenario_json: {
            heroHand: { card1: 'Ah', card2: 'Kd' },
            heroPosition: 'CO',
            heroStack: 100,
            gameType: 'cash',
            board: { flop: ['Ks', '7h', '2c'], turn: null, river: null },
            villains: [{ position: 'BB', archetype: { id: 'calling_station', name: 'Calling Station' }, stack: 100 }],
            actionHistory: [{ position: 'CO', action: 'bet_66', label: 'Bet 66%' }],
        },
        correct_action: 'Bet 66%',
        description: 'Top pair, top kicker vs a calling station. How thin should you value bet?',
    },
    {
        id: 'week_default_2',
        scenario_json: {
            heroHand: { card1: '9s', card2: '8s' },
            heroPosition: 'BTN',
            heroStack: 100,
            gameType: 'cash',
            board: { flop: ['7h', '6d', '2c'], turn: null, river: null },
            villains: [{ position: 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 100 }],
            actionHistory: [],
        },
        correct_action: 'Bet 33%',
        description: 'Open-ended straight draw with backdoor flush. C-bet or check back?',
    },
    {
        id: 'week_default_3',
        scenario_json: {
            heroHand: { card1: 'Qh', card2: 'Jh' },
            heroPosition: 'BTN',
            heroStack: 100,
            gameType: 'tournament',
            board: { flop: ['Th', '4h', '2d'], turn: null, river: null },
            villains: [{ position: 'BB', archetype: { id: 'nit', name: 'Nit' }, stack: 80 }],
            actionHistory: [{ position: 'BB', action: 'check', label: 'Check' }],
        },
        correct_action: 'Bet 50%',
        description: 'Flush draw + two overs on a dry board. Semi-bluff or slow play?',
    },
];

export default async function handler(req, res) {
  try {
      const supabase = getSupabase();

      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // Weekly spot is static, refreshed once/day — cache 1 hour at edge
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');

      try {
          // Try to fetch from DB first — getSupabase() already falls back to the
          // anon key, so no env guard is needed (and referencing undefined env
          // consts here previously threw, killing the whole DB path).
          const today = getTodayCST(); // Phase 77 — CST anchor: weekly spot rotation matches user's local week boundary

          const { data, error } = await supabase
              .from('sandbox_weekly_spots')
              .select('*')
              .lte('week_start', today)
              .order('week_start', { ascending: false })
              .limit(1);

          if (error && error.code !== '42P01') {
              console.warn('[weekly-spot] Query error:', error.message);
          }

          if (!error && data && data.length > 0) {
              return res.status(200).json({ spot: data[0], source: 'database' });
          }

          // Fallback: use curated spots based on week number
          const weekNum = Math.floor((Date.now() - new Date('2026-01-01T00:00:00Z').getTime()) / (7 * 24 * 60 * 60 * 1000));
          const spot = CURATED_SPOTS[((weekNum % CURATED_SPOTS.length) + CURATED_SPOTS.length) % CURATED_SPOTS.length];

          return res.status(200).json({ spot, source: 'curated' });
      } catch (err) {
          console.warn('Weekly spot error:', err);
          // Always return a spot, even on error
          return res.status(200).json({ spot: CURATED_SPOTS[0], source: 'fallback' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
