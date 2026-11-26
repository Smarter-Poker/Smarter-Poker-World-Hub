import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { resolveAnonKey } from '../../../src/lib/supabaseKeys';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { analysisWindow, INSIGHT_WINDOWS, readSessionInsights } from '../../../src/lib/bankroll/sessionInsights.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Sign in to review your ledger.' });
  }
  const days = req.body?.days ?? 90;
  if (!INSIGHT_WINDOWS.includes(days)) return res.status(400).json({ success: false, error: 'Choose 7, 30 or 90 days.' });

  try {
    // This client is per request so a token cannot carry into another user's read.
    const { key } = resolveAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
      global: { headers: { Authorization: req.headers.authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { user, error: authError, status } = await getServerUserWithFallback(req, db);
    if (authError || !user) return res.status(status === 503 ? 503 : 401).json({
      success: false, error: status === 503 ? 'Account verification is unavailable.' : 'Sign in to review your ledger.',
    });
    const { data: profile, error } = await db.from('profiles').select('is_vip,vip_tier,vip_expires_at').eq('id', user.id).maybeSingle();
    if (error) throw new Error('Membership lookup unavailable');
    const now = new Date();
    const activeVip = profile?.is_vip === true && (profile.vip_tier === 'lifetime' || Date.parse(profile.vip_expires_at) > now.getTime());
    if (!activeVip) return res.status(403).json({ success: false, error: 'A current VIP membership is required for Jarvis Insights.' });
    const report = await readSessionInsights(db, user.id, analysisWindow(days, now));
    return res.status(200).json({ success: true, insights: report, metrics: report.metrics });
  } catch (error) {
    reportApiError(error, req);
    return res.status(503).json({ success: false, error: 'Your ledger analysis is unavailable. Try again.' });
  }
}
