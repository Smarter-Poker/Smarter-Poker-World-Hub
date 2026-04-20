import { createClient } from '../../../../../../src/lib/supabaseServerClient';
import { guardUser } from '../../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const user = await guardUser(req, res);
    if (!user) return;

    const { id: groupId } = req.query;
    const { target_user_id } = req.body;

    if (!groupId || !target_user_id) {
      return res.status(400).json({ success: false, error: 'Group ID and target_user_id are required' });
    }

    const { data: result, error } = await getSupabase().rpc('start_home_game_player_dm', {
      p_group_id: groupId,
      p_target_user_id: target_user_id
    });

    if (error) {
      console.error('RPC start_home_game_player_dm error:', error);
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, dm_url: result?.dm_url || result });
  } catch (err) {
    try { reportApiError(err, req); } catch (_e) {}
    console.error('API Error [dm-player.js]:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
