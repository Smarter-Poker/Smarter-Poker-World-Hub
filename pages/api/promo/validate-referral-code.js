// Validate a referral code (player number or Referral Crew code) - returns referrer info
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

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
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const { code } = req.body;
      if (!code) {
          return res.status(400).json({ error: 'Referral code is required' });
      }

      // A referral is a player number (digits) or a Referral Crew code
      // (SP-56737B), which the Referral Crew card has shared since launch.
      const raw = String(code).trim().toUpperCase();
      const isNumber = /^[0-9]{1,9}$/.test(raw) && Number(raw) > 0;
      const isCrewCode = /^[A-Z0-9]{1,16}-[A-Z0-9]{1,16}$/.test(raw);
      if (!isNumber && !isCrewCode) {
          return res.status(400).json({ valid: false, error: 'Invalid referral code' });
      }

      try {
          const query = getSupabase()
              .from('profiles')
              .select('id, display_name, username, player_number');
          const { data, error } = await (isNumber
              ? query.eq('player_number', String(Number(raw)))
              : query.eq('referral_code', raw)
          ).maybeSingle();

          if (error || !data) {
              return res.status(404).json({ valid: false, error: 'No player found with that referral code' });
          }

          // Mask the name for privacy (show first name + last initial)
          const displayName = data.display_name || data.username || 'A Player';
          const parts = displayName.split(' ');
          const maskedName = parts.length > 1
              ? `${parts[0]} ${parts[parts.length - 1][0]}.`
              : parts[0];

          return res.status(200).json({
              valid: true,
              referrerId: data.id,
              playerNumber: data.player_number,
              referrerName: maskedName,
          });
      } catch (err) {
          console.warn('Validate referral code error:', err);
          return res.status(500).json({ error: 'Server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
