import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * Per-user HR bet tracking. Account-synced (RLS-protected table public.mlb_hr_bets in
 * the MAIN smarter.poker Supabase project). Identity comes from the verified Supabase
 * JWT (Authorization: Bearer <access_token>) — never from the request body (IDOR-safe).
 *
 *  GET    /api/mlb/hr-bets[?player_id=123]   → list the caller's bets (optionally one player)
 *  POST   /api/mlb/hr-bets                    → add a bet  { player_id, player_name?, team_id?, stake, american_odds, bet_date?, result?, note? }
 *  PATCH  /api/mlb/hr-bets                    → update a bet { id, result?, stake?, american_odds?, note? }
 *  DELETE /api/mlb/hr-bets?id=123             → delete a bet
 */

let _sb: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_sb) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error('[hr-bets] NEXT_PUBLIC_SUPABASE_URL is not set — cannot connect to Supabase');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
    _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _sb;
}

async function fetchAllRows(build: () => any, pageSize = 1000, maxRows = 20000): Promise<any[]> {
  let all: any[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

const RESULTS = ['pending', 'hit', 'miss', 'push'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getSupabase() as any;

  // ── Auth: verify the caller and derive their user_id from the JWT ──
  const authHeader = req.headers.authorization;
  const authStr = Array.isArray(authHeader) ? authHeader[0] : authHeader || '';
  const token = authStr.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Auth required' });
  const { data: authData, error: authErr } = await sb.auth.getUser(token);
  const user = authData?.user;
  if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired session' });
  const userId = user.id;

  try {
    if (req.method === 'GET') {
      let q = () => sb
        .from('mlb_hr_bets')
        .select('*')
        .eq('user_id', userId)
        .order('bet_date', { ascending: false })
        .order('created_at', { ascending: false });
      const pid = req.query.player_id ? parseInt(String(req.query.player_id), 10) : null;
      if (pid != null && !Number.isNaN(pid)) {
        const baseQ = q;
        q = () => baseQ().eq('player_id', pid);
      }
      const data = await fetchAllRows(q);
      return res.status(200).json({ bets: data || [] });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const player_id = parseInt(String(b.player_id), 10);
      const stake = Number(b.stake); // 2dp to match numeric(10,2)
      const american_odds = parseInt(String(b.american_odds), 10);
      if (Number.isNaN(player_id)) return res.status(400).json({ error: 'player_id required' });
      if (Number.isNaN(stake) || stake < 0 || stake > 99999999.99)
        return res.status(400).json({ error: 'valid stake required' });
      if (Number.isNaN(american_odds) || american_odds === 0)
        return res.status(400).json({ error: 'valid american_odds required' });
      // Bound runaway growth / scripted abuse: cap rows per user.
      const { count: userBetCount } = await sb
        .from('mlb_hr_bets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if ((userBetCount ?? 0) >= 2000) return res.status(429).json({ error: 'Bet limit reached' });
      let team_id: number | null = null;
      if (b.team_id != null) {
        const t = parseInt(String(b.team_id), 10);
        team_id = Number.isNaN(t) ? null : t;
      }
      const result = RESULTS.includes(b.result) ? b.result : 'pending';
      const row: Record<string, unknown> = {
        user_id: userId,
        player_id,
        player_name: b.player_name ? String(b.player_name).slice(0, 120) : null,
        team_id,
        stake,
        american_odds,
        result,
        note: b.note ? String(b.note).slice(0, 500) : null,
      };
      if (b.bet_date && /^\d{4}-\d{2}-\d{2}$/.test(String(b.bet_date))) row.bet_date = b.bet_date;
      const { data, error } = await sb.from('mlb_hr_bets').insert(row).select().maybeSingle();
      if (error) throw error;
      return res.status(200).json({ bet: data });
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      const id = parseInt(String(b.id), 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'id required' });
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (b.result !== undefined) {
        if (!RESULTS.includes(b.result)) return res.status(400).json({ error: 'invalid result' });
        patch.result = b.result;
      }
      if (b.stake !== undefined) {
        const s = Number(b.stake);
        if (Number.isNaN(s) || s < 0 || s > 99999999.99)
          return res.status(400).json({ error: 'invalid stake' });
        patch.stake = s;
      }
      if (b.american_odds !== undefined) {
        const o = parseInt(String(b.american_odds), 10);
        if (Number.isNaN(o) || o === 0) return res.status(400).json({ error: 'invalid odds' });
        patch.american_odds = o;
      }
      if (b.note !== undefined) patch.note = b.note ? String(b.note).slice(0, 500) : null;
      // Scope the update to the caller's own row (defense-in-depth alongside RLS).
      const { data, error } = await sb
        .from('mlb_hr_bets')
        .update(patch)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Bet not found' });
      return res.status(200).json({ bet: data });
    }

    if (req.method === 'DELETE') {
      const id = parseInt(String(req.query.id), 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'id required' });
      const { error } = await sb.from('mlb_hr_bets').delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err: any) {
    console.error('[hr-bets] error:', err?.message || err);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(500).json({ error: 'Bet tracking request failed' });
  }
}
