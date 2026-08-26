import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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

const VALID_RUN_TYPES = ['test', 'cycle', 'daily', 'publish'];

export default async function handler(req, res) {
  try {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      if (!applyRateLimit(req, res, LIMITS.write)) return;

      // Auth check
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Authorization required' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { data: profile } = await getSupabase().from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          // This is a role failure, not a kill switch. The old message
          // ("Admin routes are disabled in production") sent every operator
          // hunting for a feature flag that does not exist.
          return res.status(403).json({ error: 'Admin access required' });
      }

      const { type } = req.body || {};
      if (!VALID_RUN_TYPES.includes(type)) {
          return res.status(400).json({
              error: `Invalid run type. Must be one of: ${VALID_RUN_TYPES.join(', ')}`,
          });
      }

      // ── NOT IMPLEMENTED ──────────────────────────────────────────────────
      // This route used to fetch `/api/cron/horses-stories`. That handler does
      // not exist anywhere under pages/api/cron/ — the horses-* cron files live
      // in archive/cron/ and are not routable. So the fetch 404'd, the
      // subsequent .json() threw, the throw was swallowed, and the route
      // returned { success: true } with a pipeline_runs row recording a run
      // that never happened. Every pipeline button in /horses reported success
      // and did nothing.
      //
      // Two things are deliberately NOT done here any more:
      //   1. No pipeline_runs row is written. Logging a run that did not
      //      execute is what made the lie durable.
      //   2. No self-fetch. The old code built its target from
      //      req.headers.host and sent `Bearer ${process.env.CRON_SECRET}` to
      //      it, so a spoofed Host header exfiltrated CRON_SECRET to an
      //      attacker-chosen server. Removing the self-call removes the vector
      //      outright. If this is ever implemented, derive the base URL from
      //      process.env.NEXT_PUBLIC_SITE_URL or process.env.VERCEL_URL and
      //      never from a request header.
      return res.status(501).json({
          success: false,
          error: 'Pipeline triggering is not implemented — the /api/cron/horses-stories handler does not exist, so no pipeline was run and no run was logged.',
          requestedType: type,
      });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
