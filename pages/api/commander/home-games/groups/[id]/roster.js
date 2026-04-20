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
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const user = await guardUser(req, res);
    if (!user) return;

    const { id: groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({ success: false, error: 'Group ID is required' });
    }

    const { data: result, error } = await getSupabase().rpc('get_home_group_roster', {
      p_group_id: groupId
    });

    if (error) {
      console.error('RPC get_home_group_roster error:', error);
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, roster: result || [] });
  } catch (err) {
    try { reportApiError(err, req); } catch (_e) {}
    console.error('API Error [roster.js]:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
