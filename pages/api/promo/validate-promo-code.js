// Validate a promo code — used by signup form for real-time checking
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
      if (!code || typeof code !== 'string') {
          return res.status(400).json({ error: 'Promo code is required' });
      }

      try {
          const { data, error } = await getSupabase()
              .from('promo_codes')
              .select('id, code, description, reward_type, reward_value, max_uses, times_used, is_active, expires_at')
              .eq('code', code.toUpperCase().trim())
              .maybeSingle();

          if (error || !data) {
              return res.status(404).json({ valid: false, error: 'Invalid promo code' });
          }

          // Check if active
          if (!data.is_active) {
              return res.status(400).json({ valid: false, error: 'This promo code is no longer active' });
          }

          // Check expiration
          if (data.expires_at && new Date(data.expires_at) < new Date()) {
              return res.status(400).json({ valid: false, error: 'This promo code has expired' });
          }

          // Check usage limit
          if (data.max_uses !== null && data.times_used >= data.max_uses) {
              return res.status(400).json({ valid: false, error: 'This promo code has reached its usage limit' });
          }

          return res.status(200).json({
              valid: true,
              code: data.code,
              description: data.description,
              type: data.reward_type,
              value: data.reward_value,
          });
      } catch (err) {
          console.warn('Validate promo code error:', err);
          return res.status(500).json({ error: 'Server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
