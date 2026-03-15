/**
 * POST /api/arcade/start
 * Start a new arcade game session — deduct entry fee, create session record
 * 
 * Body: { gameType, entryFee }
 * Auth: Bearer token required
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Valid game types and their server-side entry fees (must match arcadeEngine.ts)
const GAME_ENTRY_FEES = {
    'hand-snap':        10,
    'board-nuts':       15,
    'chip-math':        10,
    'showdown':         20,
    'double-or-nothing': 50,
    'the-gauntlet':     100,
    'mystery-box':      25,
    'ev-or-fold':       30,
};

export default async function handler(req, res) {
  try {
      if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Authentication required' });

      const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { gameType } = req.body;
      if (!gameType) return res.status(400).json({ error: 'gameType required' });

      // Server enforces entry fee — never trust client-supplied amount
      const entryFee = GAME_ENTRY_FEES[gameType] ?? 0;

      try {
          if (entryFee > 0) {
              // Check balance
              const { data: profile } = await getSupabase()
                  .from('profiles')
                  .select('diamonds')
                  .eq('id', user.id)
                  .maybeSingle();

              if (!profile || (profile.diamonds || 0) < entryFee) {
                  return res.status(400).json({
                      error: 'Insufficient diamonds',
                      required: entryFee,
                      current: profile?.diamonds || 0,
                  });
              }

              // Deduct entry fee atomically
              const { error: deductErr } = await getSupabase().rpc('add_diamonds_to_balance', {
                  p_user_id: user.id,
                  p_amount: -entryFee,
                  p_type: 'arcade_entry',
                  p_description: `${gameType} entry fee (${entryFee}💎)`,
                  p_reference_id: null,
              });
              if (deductErr) throw new Error(deductErr.message);
          }

          // Create session record for audit trail
          const { data: session } = await getSupabase()
              .from('diamond_arena_events')
              .insert({
                  user_id: user.id,
                  event_type: 'game_start',
                  game_type: gameType,
                  entry_fee: entryFee,
                  diamonds_delta: -entryFee,
                  status: 'active',
              })
              .select('id')
              .maybeSingle();

          return res.status(200).json({
              success: true,
              sessionId: session?.id || null,
              entryFee,
              message: 'Game started',
          });
      } catch (err) {
          console.error('[arcade/start]', err.message);
          return res.status(500).json({ error: 'Failed to start game' });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
