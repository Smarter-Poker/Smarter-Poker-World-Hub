import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * ANTI-ABUSE ADMIN API
 * GET /api/horses/anti-abuse — Returns abuse log, audit log, alerts, and economy data
 * Used by the /horses Anti-Abuse dashboard tab
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
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

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

      if (!applyRateLimit(req, res, LIMITS.read)) return;

      // ── AUTH: Require valid JWT + admin role ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Authorization required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { data: profile } = await getSupabase()
          .from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          return res.status(403).json({ error: 'Admin access required' });
      }

      const section = req.query.section || 'all';

      try {
          const result = {};

          // ── ABUSE LOG ──
          if (section === 'all' || section === 'abuse') {
              const { data: abuseLog } = await getSupabase()
                  .from('signup_abuse_log')
                  .select('*')
                  .order('last_signup_at', { ascending: false })
                  .limit(100);

              // Stats over the WHOLE table, not just the 100-row page above.
              // These were previously derived from `abuseLog` alone, so
              // "Total Signups" was really the page size.
              const [totalRes, deletedRes, flaggedRes] = await Promise.all([
                  getSupabase().from('signup_abuse_log').select('id', { count: 'exact', head: true }),
                  getSupabase().from('signup_abuse_log').select('id', { count: 'exact', head: true }).gt('deleted_account_count', 0),
                  getSupabase().from('signup_abuse_log').select('id', { count: 'exact', head: true })
                      .not('abuse_flags', 'is', null).neq('abuse_flags', '[]'),
              ]);

              if (totalRes.error) console.warn('[Anti-Abuse] total count error:', totalRes.error.message || totalRes.error);
              if (deletedRes.error) console.warn('[Anti-Abuse] deleted count error:', deletedRes.error.message || deletedRes.error);
              if (flaggedRes.error) console.warn('[Anti-Abuse] flagged count error:', flaggedRes.error.message || flaggedRes.error);

              const totalSignups = totalRes.count ?? null;
              const blocked = flaggedRes.count ?? null;
              const deletedAccounts = deletedRes.count ?? null;

              // `disposable` depends on the CONTENT of each abuse_flags entry,
              // which PostgREST cannot aggregate. It is therefore computed over
              // the fetched page only and labelled as such rather than being
              // presented as a whole-table figure.
              const disposable = (abuseLog || []).filter(a => {
                  const flags = a.abuse_flags || [];
                  return Array.isArray(flags) && flags.some(f => f?.reason?.includes('disposable'));
              }).length;

              // Top IPs
              const ipCounts = {};
              abuseLog?.forEach(entry => {
                  if (entry.ip_address && entry.ip_address !== 'unknown') {
                      ipCounts[entry.ip_address] = (ipCounts[entry.ip_address] || 0) + 1;
                  }
              });
              const topIPs = Object.entries(ipCounts || {})
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([ip, count]) => ({ ip, count }));

              result.abuse = {
                  log: abuseLog || [],
                  stats: {
                      totalSignups,
                      blocked,
                      deletedAccounts,
                      disposable,
                      disposableScope: 'current page only',
                  },
                  topIPs,
              };
          }

          // ── ADMIN AUDIT LOG ──
          if (section === 'all' || section === 'audit') {
              const { data: auditLog } = await getSupabase()
                  .from('admin_audit_log')
                  .select('*')
                  .order('created_at', { ascending: false })
                  .limit(50);

              result.audit = auditLog || [];
          }

          // ── DIAMOND ECONOMY ──
          if (section === 'all' || section === 'economy') {
              // Diamond source breakdown over a defined 30-day window.
              // Previously this pulled 5000 rows with NO order and NO window,
              // so Postgres returned an arbitrary 5000 rows and the breakdown
              // described no particular period at all.
              const ECONOMY_WINDOW_DAYS = 30;
              const economySince = new Date(Date.now() - ECONOMY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
              const { data: transactions, error: txErr } = await getSupabase()
                  .from('diamond_transactions')
                  .select('transaction_type, amount')
                  .gte('created_at', economySince)
                  .order('created_at', { ascending: false })
                  .limit(5000);

              if (txErr) console.warn('[Anti-Abuse] diamond_transactions error:', txErr.message || txErr);

              const sourceBreakdown = {};
              let totalGranted = 0;
              let totalSpent = 0;

              (transactions || []).forEach(tx => {
                  const type = tx.transaction_type || 'unknown';
                  sourceBreakdown[type] = (sourceBreakdown[type] || 0) + Math.abs(tx.amount);
                  if (tx.amount > 0) totalGranted += tx.amount;
                  else totalSpent += Math.abs(tx.amount);
              });

              // Top diamond holders.
              //
              // `email` is NOT selected. This is a top-20 leaderboard on an
              // admin dashboard; it needs to identify an account, which
              // username and id already do. Shipping twenty real email
              // addresses in every poll of this endpoint is bulk PII the
              // surface has no use for. `phone_verified` stays — it is the
              // abuse signal the tab exists to show.
              const { data: topHolders } = await getSupabase()
                  .from('profiles')
                  .select('id, username, diamonds, is_vip, vip_tier, phone_verified')
                  .order('diamonds', { ascending: false })
                  .limit(20);

              result.economy = {
                  sourceBreakdown,
                  totalGranted,
                  totalSpent,
                  topHolders: topHolders || [],
                  windowDays: ECONOMY_WINDOW_DAYS,
                  windowSince: economySince,
                  // Printable verbatim next to Total Granted / Total Spent.
                  // Those are WINDOWED figures, not lifetime totals, and the
                  // UI had no label saying so.
                  windowLabel: `last ${ECONOMY_WINDOW_DAYS} days`,
                  truncated: (transactions || []).length >= 5000,
              };
          }

          // ── RECENT ALERTS (abuse events in last 24h) ──
          if (section === 'all' || section === 'alerts') {
              const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).getTime();

              // Optimization: reuse abuse log data if already fetched, avoid duplicate DB query
              const sourceData = result.abuse?.log || [];
              let alertSource = sourceData;

              if (sourceData.length === 0) {
                  // Only query DB if abuse section wasn't already fetched.
                  // Bounded: this was the one unbounded read left in the
                  // route, and a bad 24 hours would have returned the whole
                  // signup_abuse_log to the browser.
                  const ALERT_CAP = 200;
                  const { data: recentAbuse } = await getSupabase()
                      .from('signup_abuse_log')
                      .select('*')
                      .gt('last_signup_at', new Date(twentyFourHoursAgo).toISOString())
                      .order('last_signup_at', { ascending: false })
                      .limit(ALERT_CAP);
                  alertSource = recentAbuse || [];
              } else {
                  // Filter already-fetched data by 24h window
                  alertSource = sourceData.filter(a =>
                      a.last_signup_at && new Date(a.last_signup_at).getTime() > twentyFourHoursAgo
                  );
              }

              const alerts = alertSource
                  .filter(a => a.abuse_flags && a.abuse_flags.length > 0)
                  .map(a => ({
                      id: a.id,
                      email: a.raw_email,
                      ip: a.ip_address,
                      reason: a.abuse_flags[a.abuse_flags.length - 1]?.reason || 'Unknown',
                      at: a.last_signup_at,
                      deletions: a.deleted_account_count,
                  }));

              result.alerts = alerts;
          }

          return res.status(200).json({ success: true, ...result });
      } catch (err) {
          console.warn('[Anti-Abuse API] Error:', err);
          return res.status(500).json({ error: 'Server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
