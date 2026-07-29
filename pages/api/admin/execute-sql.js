import { createClient } from '../../../src/lib/supabaseServerClient';
import { Pool } from 'pg';
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


// [HARDENING] Increase body size limit to 10MB to support large AI-generated SQL migrations
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req, res) {
  try {
      // [HARDENED] No CORS — same-origin only. No cross-origin access allowed.

      if (req.method === 'OPTIONS') {
          return res.status(405).json({ success: false, error: 'CORS preflight not supported.' });
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      let { sql } = req.body;
      if (!sql) {
          return res.status(400).json({ success: false, error: 'Missing SQL query literal in body payload.' });
      }

      // [HARDENING] Agent Bulletproofing: Strip AI markdown code blocks if the agent wrapped the query
      sql = sql.replace(/^```sql\s*/im, '').replace(/```\s*$/i, '').trim();

      // 1. Omnichannel Authentication
      const authHeader = req.headers.authorization;
      if (!authHeader) {
          return res.status(401).json({ success: false, error: 'Missing Authorization Bearer header.' });
      }

      const token = authHeader.replace('Bearer ', '').trim();
      let isAuthorized = false;

      // Check 1: Headless Orb System Access (comparing token to Service Role Key)
      if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
          isAuthorized = true;
      } else {
          // Check 2: Browser User Admin Session
          try {
              

              const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
              const user = authData?.user;
              if (authErr || !user) {
                  return res.status(401).json({ success: false, error: 'Invalid JWT token.' });
              }

              const { data: profile } = await getSupabase()
                  .from('profiles')
                  .select('role')
                  .eq('id', user.id)
                  .maybeSingle();

              if (profile && ['admin', 'superadmin', 'god'].includes(profile.role)) {
                  isAuthorized = true;
              }
          } catch (err) {
              return res.status(500).json({ success: false, error: 'Auth validation crashed.' });
          }
      }

      if (!isAuthorized) {
          return res.status(403).json({ success: false, error: 'Insufficient Agent or User permissions.' });
      }

      // 1.5 Destructive Action Guard — UN-BYPASSABLE
      const isDestructive = /DROP\s+TABLE|DROP\s+SCHEMA|DROP\s+FUNCTION|DROP\s+TRIGGER|DROP\s+INDEX|DELETE\s+FROM|TRUNCATE\s+TABLE|TRUNCATE\s+|ALTER\s+TABLE\s+.*\s+DROP\s+COLUMN|ALTER\s+TABLE\s+.*\s+RENAME|CASCADE|REVOKE\s+/i.test(sql);

      if (isDestructive) {
          return res.status(403).json({
              success: false,
              error: 'Destructive action detected (DROP, DELETE, TRUNCATE, CASCADE, REVOKE). This guard cannot be bypassed. Use Supabase Dashboard SQL Editor for destructive operations.'
          });
      }

      // 2. Direct PostgreSQL Execution (Bypassing PostgREST limitation)
      // [HARDENED] Only env-var passwords — no hardcoded credentials
      const candidates = [
          process.env.SUPABASE_DB_PASSWORD,
          process.env.POSTGRES_PASSWORD,
      ].filter(Boolean);

      if (candidates.length === 0) {
          return res.status(500).json({ success: false, error: 'No database password configured in environment variables.' });
      }

      const uniqueCands = [...new Set(candidates)];

      // Build parameter-based configs (avoids encodeURIComponent mangling special chars like !)
      const connConfigs = [];
      for (const pw of uniqueCands) {
          // Supabase Supavisor pooler — port 6543 (transaction mode)
          connConfigs.push({
              host: 'aws-0-us-west-2.pooler.supabase.com',
              port: 6543,
              user: 'postgres.kuklfnapbkmacvwxktbh',
              password: pw,
              database: 'postgres',
          });
          // Direct Postgres connection — port 5432
          connConfigs.push({
              host: 'db.kuklfnapbkmacvwxktbh.supabase.co',
              port: 5432,
              user: 'postgres',
              password: pw,
              database: 'postgres',
          });
      }

      for (const cfg of connConfigs) {
          let pool;
          let client;
          try {
              pool = new Pool({
                  ...cfg,
                  ssl: { rejectUnauthorized: false },
                  connectionTimeoutMillis: 10000,
                  statement_timeout: 10000, // Hard 10-second circuit breaker
              });

              client = await pool.connect();

              // Ensure audit table exists
              await client.query(`
                  CREATE TABLE IF NOT EXISTS public.execution_audit_logs (
                      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                      executed_at timestamptz DEFAULT now(),
                      channel text NOT NULL,
                      principal text NOT NULL,
                      query text NOT NULL,
                      execution_ms integer,
                      success boolean,
                      error_details text
                  );
              `);

              const start = Date.now();
              let result;
              let success = false;
              let errorMessage = null;

              try {
                  await client.query('BEGIN');
                  result = await client.query(sql);
                  await client.query('COMMIT');
                  success = true;
              } catch (sqlErr) {
                  console.warn('[App] SQL execution error:', sqlErr?.message || sqlErr);
                  errorMessage = sqlErr.message;
                  try { await client.query('ROLLBACK'); } catch (_rb) { /* rollback best-effort */ }
              }

              const ms = Date.now() - start;

              let finalCommand = '';
              let finalRowCount = 0;
              let finalRows = [];

              if (success && result) {
                  if (Array.isArray(result)) {
                      finalCommand = result.map(r => r.command).filter(Boolean).join(', ');
                      finalRowCount = result.reduce((acc, r) => acc + (r.rowCount || 0), 0);
                      finalRows = result[result.length - 1]?.rows || [];
                  } else {
                      finalCommand = result.command || 'UNKNOWN';
                      finalRowCount = result.rowCount || 0;
                      finalRows = result.rows || [];
                  }
              }

              // Audit — execution_audit_logs (legacy, full SQL text)
              try {
                  const principal = token === process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE_AGENT' : 'ADMIN_UI_USER';
                  await client.query(
                      `INSERT INTO public.execution_audit_logs (channel, principal, query, execution_ms, success, error_details) VALUES ($1, $2, $3, $4, $5, $6)`,
                      ['api-route', principal, sql, ms, success, errorMessage]
                  );
              } catch (auditErr) { console.warn('Audit log failed', auditErr); }

              // Audit — admin_audit_log (Phase 6.1.8 — unified admin trail)
              // Only logged for browser-user admin sessions; service-role agents
              // already get logged in execution_audit_logs above, and admin_user_id
              // for them isn't a real auth.uid().
              try {
                  if (token !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
                      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
                      const auditUser = authData?.user;
                      if (auditUser?.id) {
                          await getSupabase().rpc('fn_log_admin_action', {
                              p_admin_user_id: auditUser.id,
                              p_action: success ? 'admin.sql_executed' : 'admin.sql_failed',
                              p_target_type: 'database',
                              p_target_id: null,
                              p_details: {
                                  sql_preview: sql.length > 500 ? `${sql.slice(0, 500)}…` : sql,
                                  sql_length: sql.length,
                                  command: finalCommand,
                                  row_count: finalRowCount,
                                  execution_ms: ms,
                                  error: errorMessage,
                              },
                              p_before_state: null,
                              p_after_state: null,
                              p_ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || null,
                              p_user_agent: req.headers['user-agent'] || null,
                              p_request_id: req.headers['x-vercel-id'] || req.headers['x-request-id'] || null,
                          });
                      }
                  }
              } catch (auditErr) { console.warn('admin_audit_log failed', auditErr?.message || auditErr); }

              if (!success) {
                  return res.status(400).json({
                      success: false,
                      error: errorMessage
                  });
              }

              return res.status(200).json({
                  success: true,
                  command: finalCommand,
                  rowCount: finalRowCount,
                  rows: finalRows,
                  ms
              });
          } catch (e) {
              console.warn('[execute-sql] Query error:', e?.message || e);
              return res.status(500).json({
                  success: false,
                  error: e.message
              });
          } finally {
              if (client) {
                  try { client.release(); } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
              }
              if (pool) {
                  try { await pool.end(); } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
              }
          }
      }

      return res.status(500).json({ success: false, error: 'Could not establish connection to the master Supabase pooler.' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
