/**
 * Newsletter Subscription API
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const { email, source = 'news_hub' } = req.body;

          if (!email || !email.includes('@')) {
              return res.status(400).json({ success: false, error: 'Valid email required' });
          }

          // Check if already subscribed
          const { data: existing } = await getSupabase()
              .from('newsletter_subscribers')
              .select('id, is_active')
              .eq('email', email.toLowerCase())
              .maybeSingle();

          if (existing) {
              if (!existing.is_active) {
                  // Reactivate subscription
                  const { error: err_newsletter_subscribers_j66ri } = await getSupabase()
                    .from('newsletter_subscribers')
                    .update({ is_active: true, unsubscribed_at: null })
                      .eq('id', existing.id);
                  if (err_newsletter_subscribers_j66ri) console.warn('[Supabase] Silent mutation failed in newsletter_subscribers:', err_newsletter_subscribers_j66ri.message);

                  return res.status(200).json({ success: true, message: 'Subscription reactivated!' });
              }
              return res.status(200).json({ success: true, message: 'Already subscribed!' });
          }

          // New subscription
          const { error } = await getSupabase()
              .from('newsletter_subscribers')
              .insert({ email: email.toLowerCase(), source });

          if (error) throw error;

          return res.status(200).json({ success: true, message: 'Successfully subscribed!' });
      } catch (error) {
          console.warn('Newsletter subscription error:', error);
          return res.status(500).json({ success: false, error: 'Subscription failed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
