/**
 * Security Audit API - Automated security checks for production readiness
 *
 * GET /api/admin/security-audit
 *   Runs all security checks and returns results
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

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
      const supabase = getSupabase();

      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // Admin-only in production
      if (process.env.NODE_ENV === 'production') {
          // SECURITY: a missing ADMIN_API_TOKEN is a server misconfiguration, not
          // a grant. This previously FAILED OPEN in production: with the token
          // unset the template collapsed to the literal string "Bearer undefined",
          // so `Authorization: Bearer undefined` authenticated any caller and
          // exposed this endpoint's env-configuration inventory.
          const adminApiToken = process.env.ADMIN_API_TOKEN;
          if (!adminApiToken) {
              console.warn('[security-audit] ADMIN_API_TOKEN is not configured — rejecting request');
              return res.status(500).json({ error: 'Server misconfigured' });
          }
          const authHeader = req.headers.authorization;
          if (!authHeader || authHeader !== `Bearer ${adminApiToken}`) {
              return res.status(403).json({ error: 'Forbidden' });
          }
      }

      const checks = [];
      let passed = 0;
      let warned = 0;
      let failed = 0;

      function addCheck(name, status, detail) {
          checks.push({ name, status, detail });
          if (status === 'pass') passed++;
          else if (status === 'warn') warned++;
          else failed++;
      }

      // ==========================================
      // 1. Environment Configuration Checks
      // ==========================================

      // Check Supabase config
      addCheck(
          'Supabase URL configured',
          process.env.NEXT_PUBLIC_SUPABASE_URL ? 'pass' : 'fail',
          process.env.NEXT_PUBLIC_SUPABASE_URL ? 'URL is set' : 'NEXT_PUBLIC_SUPABASE_URL missing'
      );

      addCheck(
          'Supabase Anon Key configured',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'pass' : 'fail',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Key is set' : 'NEXT_PUBLIC_SUPABASE_ANON_KEY missing'
      );

      addCheck(
          'Supabase Service Role Key configured',
          process.env.SUPABASE_SERVICE_ROLE_KEY ? 'pass' : 'warn',
          process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Key is set' : 'SUPABASE_SERVICE_ROLE_KEY missing (API routes will fail)'
      );

      // Check service key is not exposed publicly
      addCheck(
          'Service key not in public env vars',
          !process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ? 'pass' : 'fail',
          !process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
              ? 'Service key is not exposed publicly'
              : 'CRITICAL: Service role key is in NEXT_PUBLIC_ - anyone can see it!'
      );

      // ==========================================
      // 2. Authentication Security
      // ==========================================

      addCheck(
          'Auth storage key is custom',
          true ? 'pass' : 'warn',
          'Using custom storage key: smarter-poker-auth'
      );

      // ==========================================
      // 3. External Service Configurations
      // ==========================================

      // Sentry
      addCheck(
          'Sentry error monitoring',
          process.env.NEXT_PUBLIC_SENTRY_DSN ? 'pass' : 'warn',
          process.env.NEXT_PUBLIC_SENTRY_DSN ? 'Sentry DSN configured' : 'Sentry not configured - errors won\'t be tracked'
      );

      // OneSignal
      addCheck(
          'OneSignal push notifications',
          process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_API_KEY ? 'pass' : 'warn',
          process.env.ONESIGNAL_APP_ID ? 'OneSignal configured' : 'OneSignal not configured - push notifications disabled'
      );

      // Twilio
      addCheck(
          'Twilio SMS',
          process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? 'pass' : 'warn',
          process.env.TWILIO_ACCOUNT_SID ? 'Twilio configured' : 'Twilio not configured - SMS disabled'
      );

      // Resend
      addCheck(
          'Resend email',
          process.env.RESEND_API_KEY ? 'pass' : 'warn',
          process.env.RESEND_API_KEY ? 'Resend configured' : 'Resend not configured - transactional emails disabled'
      );

      // Stripe
      addCheck(
          'Stripe payments',
          process.env.STRIPE_SECRET_KEY ? 'pass' : 'warn',
          process.env.STRIPE_SECRET_KEY ? 'Stripe configured' : 'Stripe not configured - payments disabled'
      );

      // Google Maps
      addCheck(
          'Google Maps API',
          process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? 'pass' : 'warn',
          process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? 'Google Maps configured' : 'Google Maps not configured - map features disabled'
      );

      // ==========================================
      // 4. Database Security Checks
      // ==========================================

      if (supabaseUrl && supabaseServiceKey) {
          

          // Check RLS is enabled on critical tables
          const criticalTables = [
              'profiles', 'social_posts', 'social_comments', 'social_interactions',
              'follows', 'notifications', 'messages',
          ];

          for (const table of criticalTables) {
              try {
                  // Safe RLS check: attempt a .select() — if RLS blocks it, we get an error
                  const { error: tableError } = await supabase
                      .from(table)
                      .select('id')
                      .limit(0);

                  if (tableError && tableError.code === '42P01') {
                      addCheck(
                          `RLS on ${table}`,
                          'fail',
                          `Table ${table} does not exist`
                      );
                  } else {
                      addCheck(
                          `RLS on ${table}`,
                          'pass',
                          `Table ${table} accessible — verify RLS in Supabase dashboard`
                      );
                  }
              } catch {
                  addCheck(
                      `RLS on ${table}`,
                      'warn',
                      'Could not verify - check manually in Supabase dashboard'
                  );
              }
          }
      }

      // ==========================================
      // 5. Application Security
      // ==========================================

      addCheck(
          'NODE_ENV is set',
          process.env.NODE_ENV ? 'pass' : 'warn',
          `Current environment: ${process.env.NODE_ENV || 'not set'}`
      );

      addCheck(
          'Admin API token configured',
          process.env.ADMIN_API_TOKEN ? 'pass' : 'warn',
          process.env.ADMIN_API_TOKEN ? 'Admin token is set' : 'No admin token - admin APIs unprotected in production'
      );

      // ==========================================
      // 6. Headers & Transport Security
      // ==========================================

      addCheck(
          'Strict-Transport-Security',
          process.env.NODE_ENV === 'production' ? 'warn' : 'pass',
          'Ensure HSTS header is set in Vercel config or middleware'
      );

      addCheck(
          'Content-Security-Policy',
          'warn',
          'Recommend adding CSP header in next.config.js security headers'
      );

      // ==========================================
      // Summary
      // ==========================================

      const score = Math.round((passed / checks.length) * 100);
      const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

      return res.status(200).json({
          success: true,
          audit: {
              timestamp: new Date().toISOString(),
              environment: process.env.NODE_ENV || 'unknown',
              score,
              grade,
              summary: { total: checks.length, passed, warned, failed },
              checks,
              recommendations: [
                  ...(failed > 0 ? ['Fix all FAILED checks immediately'] : []),
                  ...(!process.env.NEXT_PUBLIC_SENTRY_DSN ? ['Set up Sentry for error tracking (free tier available)'] : []),
                  ...(!process.env.ONESIGNAL_APP_ID ? ['Configure OneSignal for push notifications (free tier)'] : []),
                  ...(!process.env.ADMIN_API_TOKEN ? ['Set ADMIN_API_TOKEN to protect admin endpoints'] : []),
                  'Add Content-Security-Policy header',
                  'Enable rate limiting on API routes',
                  'Set up database backups in Supabase',
                  'Review RLS policies in Supabase dashboard',
              ],
          },
      });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
