import crypto from 'crypto';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { Pool } from 'pg';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { requestIdOf } from '../../../src/lib/horses/apiEnvelope.js';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// The audit client is SERVICE ROLE ONLY. getSupabase() falls back to the anon
// key, and under the anon key operatorAudit's documented "direct service-role
// insert if the RPC is unavailable" runs under RLS and is denied - the fallback
// that exists to guarantee the row can never fire. Returning null instead makes
// the helper log a dropped row loudly rather than pretend it wrote one.
let _auditDb;
function getAuditDb() {
    if (_auditDb === undefined) {
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) {
            console.error('[execute-sql] SUPABASE_SERVICE_ROLE_KEY missing; sql.commit audit rows cannot be written');
            _auditDb = null;
        } else {
            const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
            _auditDb = createClient(url, key);
        }
    }
    return _auditDb;
}

// [PERF] The execution_audit_logs CREATE TABLE IF NOT EXISTS used to run on
// EVERY request - a full DDL round-trip against the pooler before any real
// work. It only has to happen once per warm lambda.
let _auditTableEnsured = false;

/**
 * Constant-time bearer-token comparison.
 *
 * A plain `===` on a secret leaks its bytes through timing: the comparison
 * exits at the first differing character, so response latency tells an
 * attacker how much of a guessed prefix is correct. timingSafeEqual throws on
 * length mismatch, so the length is checked first (the length of the service
 * role key is not itself a secret worth protecting).
 */
function secretEquals(candidate, secret) {
    if (typeof candidate !== 'string' || typeof secret !== 'string') return false;
    if (candidate.length === 0 || secret.length === 0) return false;
    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(secret, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * Strip comments (and only comments) so the mutation scan below cannot be
 * fooled by `-- DELETE FROM` or a commented-out block. String literals are
 * deliberately NOT stripped: leaving them in produces false POSITIVES (a
 * SELECT containing the word 'update' in a literal gets treated as mutating
 * and therefore dry-run) which is the safe direction to be wrong in.
 *
 * `FOR UPDATE` / `FOR NO KEY UPDATE` / `FOR SHARE` row-locking clauses are
 * removed because they are read-side syntax and would otherwise force every
 * locking SELECT down the confirmation path.
 */
function scanText(sql) {
    return String(sql)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n\r]*/g, ' ')
        .replace(/\bFOR\s+(NO\s+KEY\s+)?UPDATE\b/gi, ' ')
        .replace(/\bFOR\s+(KEY\s+)?SHARE\b/gi, ' ');
}

/**
 * Statements that change state. Anything matching this runs as a rolled-back
 * dry run unless the caller confirms it verbatim (see MUTATION SAFETY below).
 *
 * WHAT THIS IS: a guard against the common accident - the pasted DELETE with
 * no WHERE, the UPDATE aimed at the wrong table, the DROP typed into the
 * wrong tab.
 *
 * WHAT THIS IS NOT: a security boundary. It is a text regex over SQL, and SQL
 * can hide its own verbs. `DO $$ BEGIN EXECUTE format('DR'||'OP TABLE x'); END $$;`
 * has no literal "DROP TABLE" in it, and neither does any other dynamic-SQL
 * construction. A caller who WANTS to defeat this can, trivially. The reason
 * that is tolerable is that this endpoint is already authenticated to
 * admin/superadmin/god or the service role key - a determined caller with
 * those credentials does not need to trick a regex. The regex is here to stop
 * a fumble, not an adversary. `\bDO\s*\$\$` is matched precisely because
 * anonymous blocks are where the dynamic-SQL escape hatch lives, so at least
 * the shape of the bypass is itself confirmation-gated.
 *
 * Bare `CASCADE` used to be in this list. It was removed: on its own it means
 * nothing (`CREATE TABLE ... REFERENCES parent ON DELETE CASCADE` is an
 * ordinary additive migration) so it blocked legitimate DDL while catching
 * nothing that the real verb above it does not already catch.
 */
const MUTATION_PATTERNS = [
    'INSERT\\s+INTO',
    'UPDATE\\s+(?:ONLY\\s+)?[\\w"]',
    'DELETE\\s+FROM',
    'TRUNCATE\\b',
    'MERGE\\s+INTO',
    'DROP\\s+(?:TABLE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER|INDEX|VIEW|TYPE|POLICY|ROLE|USER|DATABASE|EXTENSION|SEQUENCE|PUBLICATION|SUBSCRIPTION|COLUMN|CONSTRAINT|OWNED)',
    'ALTER\\s+(?:TABLE|SCHEMA|FUNCTION|PROCEDURE|TYPE|ROLE|USER|DATABASE|POLICY|SEQUENCE|VIEW|INDEX|EXTENSION|PUBLICATION|DEFAULT\\s+PRIVILEGES)',
    'CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:ROLE|USER|POLICY|TABLE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER|INDEX|VIEW|TYPE|EXTENSION|SEQUENCE|PUBLICATION|MATERIALIZED\\s+VIEW|UNIQUE\\s+INDEX)',
    'GRANT\\s',
    'REVOKE\\s',
    'REASSIGN\\s+OWNED',
    'SECURITY\\s+LABEL',
    'REFRESH\\s+MATERIALIZED\\s+VIEW',
    'SET\\s+ROLE\\b',
    'COPY\\s+[\\s\\S]*?\\sFROM\\s',
    'DO\\s*\\$\\$',
    'CALL\\s',
    'VACUUM\\b',
    'REINDEX\\b',
    'CLUSTER\\b',
    'LOCK\\s+TABLE',
];
const MUTATION_RE = new RegExp('\\b(?:' + MUTATION_PATTERNS.join('|') + ')', 'i');

function isMutating(sql) {
    return MUTATION_RE.test(scanText(sql));
}

// The markdown fences agents wrap SQL in. Applied to both `sql` and
// `confirm` so a confirmation typed into the same editor still matches.
function normalizeSql(raw) {
    return String(raw).replace(/^```sql\s*/im, '').replace(/```\s*$/i, '').trim();
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
      // [HARDENED] No CORS - same-origin only. No cross-origin access allowed.

      if (req.method === 'OPTIONS') {
          return res.status(405).json({ success: false, error: 'CORS preflight not supported.' });
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // [SECURITY 2026-08-26] This route had NO rate limit at all while
      // accepting a 10MB body, opening a direct Postgres connection and
      // running arbitrary SQL. Every sibling admin route already applies one.
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      let { sql, confirm } = req.body || {};
      if (!sql) {
          return res.status(400).json({ success: false, error: 'Missing SQL query literal in body payload.' });
      }

      // [HARDENING] Agent Bulletproofing: Strip AI markdown code blocks if the agent wrapped the query
      sql = normalizeSql(sql);

      // 1. Omnichannel Authentication
      const authHeader = req.headers.authorization;
      if (!authHeader) {
          return res.status(401).json({ success: false, error: 'Missing Authorization Bearer header.' });
      }

      const token = authHeader.replace('Bearer ', '').trim();
      let isAuthorized = false;
      let sessionUserId = null;
      // The caller's REAL profiles.role, captured where it is already read.
      // The audit row used to hardcode 'admin' here, so a `god` committing a
      // mutation was filed as an `admin` - a privilege statement the row had no
      // business inventing when the true value was one line away.
      let sessionRole = null;

      // Check 1: Headless Orb System Access (comparing token to Service Role Key)
      const isServiceRole = secretEquals(token, process.env.SUPABASE_SERVICE_ROLE_KEY || '');
      if (isServiceRole) {
          isAuthorized = true;
      } else {
          // Check 2: Browser User Admin Session
          try {
              const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
              const user = authUser;
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
                  sessionUserId = user.id;
                  sessionRole = profile.role;
              }
          } catch (err) {
              console.warn('[execute-sql] Auth validation crashed:', err?.message || err);
              return res.status(500).json({ success: false, error: 'Auth validation crashed.' });
          }
      }

      if (!isAuthorized) {
          return res.status(403).json({ success: false, error: 'Insufficient Agent or User permissions.' });
      }

      // ─── 1.5 MUTATION SAFETY ──────────────────────────────────────────
      // House pattern (CLAUDE.md section 11.5, scripts/dev/probe-rpc.sql):
      // a statement that moves state is probed inside a transaction you ROLL
      // BACK. What you want from the probe is the row count and the error
      // message, not the side effects.
      //
      // So: every mutating statement is a DRY RUN by default. It executes for
      // real inside BEGIN, we read the row count and any RETURNING rows off
      // it, then we ROLLBACK. Nothing lands.
      //
      // It only COMMITs when the request body carries `confirm` equal to the
      // exact SQL string being run. Sending the statement back verbatim is a
      // deliberate second act - it cannot be produced by a stray click, a
      // retried fetch, or a checkbox someone left ticked from last time.
      //
      // The previous guard here 403'd on DROP/DELETE/TRUNCATE and let
      // `UPDATE club_members SET chip_balance = 999999999` through untouched.
      // Production holds roughly 121 million chips in that one column.
      const mutating = isMutating(sql);
      const confirmed = mutating && typeof confirm === 'string' && normalizeSql(confirm) === sql;
      const dryRun = mutating && !confirmed;

      // 2. Direct PostgreSQL Execution (Bypassing PostgREST limitation)
      // [HARDENED] Only env-var passwords - no hardcoded credentials
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
          // Supabase Supavisor pooler - port 6543 (transaction mode)
          connConfigs.push({
              host: 'aws-0-us-west-2.pooler.supabase.com',
              port: 6543,
              user: 'postgres.kuklfnapbkmacvwxktbh',
              password: pw,
              database: 'postgres',
          });
          // Direct Postgres connection - port 5432
          connConfigs.push({
              host: 'db.kuklfnapbkmacvwxktbh.supabase.co',
              port: 5432,
              user: 'postgres',
              password: pw,
              database: 'postgres',
          });
      }

      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || null;

      for (const cfg of connConfigs) {
          let pool = null;
          let client = null;

          // ── CONNECT ──────────────────────────────────────────────────
          // A failure here must fall through to the NEXT candidate. The old
          // code returned 500 from inside the loop body on any throw, so the
          // second, third and fourth entries of connConfigs were unreachable
          // dead code and the direct-Postgres fallback was never once tried.
          try {
              pool = new Pool({
                  ...cfg,
                  ssl: { rejectUnauthorized: false },
                  connectionTimeoutMillis: 10000,
                  statement_timeout: 10000, // Hard 10-second circuit breaker
              });
              client = await pool.connect();
          } catch (connErr) {
              console.warn(`[execute-sql] Connection to ${cfg.host}:${cfg.port} failed:`, connErr?.message || connErr);
              if (client) { try { client.release(); } catch (_e) { /* best effort */ } }
              if (pool) { try { await pool.end(); } catch (_e) { /* best effort */ } }
              continue;
          }

          // ── EXECUTE ──────────────────────────────────────────────────
          try {
              // Ensure audit table exists - once per warm process, not per request.
              if (!_auditTableEnsured) {
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
                  _auditTableEnsured = true;
              }

              const start = Date.now();
              let result;
              let success = false;
              let errorMessage = null;

              try {
                  await client.query('BEGIN');
                  result = await client.query(sql);
                  if (dryRun) {
                      // The statement really ran. We read its row count off the
                      // result below, then throw the work away.
                      await client.query('ROLLBACK');
                  } else {
                      await client.query('COMMIT');
                  }
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

              const principal = isServiceRole ? 'SERVICE_ROLE_AGENT' : 'ADMIN_UI_USER';

              // Audit - execution_audit_logs (legacy, full SQL text)
              try {
                  await client.query(
                      `INSERT INTO public.execution_audit_logs (channel, principal, query, execution_ms, success, error_details) VALUES ($1, $2, $3, $4, $5, $6)`,
                      [dryRun ? 'api-route-dry-run' : 'api-route', principal, sql, ms, success, errorMessage]
                  );
              } catch (auditErr) { console.warn('Audit log failed', auditErr?.message || auditErr); }

              // Audit - a COMMITTED MUTATION writes EXACTLY ONE admin_audit_log
              // row, through the shared operator audit helper (contract
              // addendum item 19), so the one act on this route that changes
              // production state carries the same actor, role, ip, user agent,
              // request id and before/after stamp as every other console write.
              //
              // There used to be a SECOND writer here: a direct INSERT on this
              // Postgres connection filing admin.sql_mutation_committed. It has
              // been removed. Every commit was producing two rows under two
              // namespaces, so the Audit tab's prefix filter both split and
              // double-counted the same statement. The full SQL text that
              // insert carried still lands in execution_audit_logs above, on
              // this same connection, so nothing readable was lost.
              //
              // For a service-role (headless) caller admin_user_id is null,
              // exactly as the removed insert wrote it; the helper logs loudly
              // and never throws if the schema refuses the row.
              //
              // Dry runs and reads keep the RPC path below: nothing happened,
              // and burying real mutations under rehearsals is how an audit
              // trail stops being read.
              if (mutating && !dryRun) {
                  await auditOperatorAction(
                      {
                          user: { id: sessionUserId },
                          role: sessionUserId ? sessionRole : 'service_role',
                          db: getAuditDb(),
                          requestId: requestIdOf(req),
                      },
                      req,
                      {
                          action: 'sql.commit',
                          targetType: 'database',
                          targetId: null,
                          details: {
                              principal,
                              sql_preview: sql.length > 500 ? `${sql.slice(0, 500)}...` : sql,
                              sql_length: sql.length,
                              command: finalCommand,
                              row_count: finalRowCount,
                              execution_ms: ms,
                              succeeded: success,
                              error: errorMessage,
                          },
                          after: { command: finalCommand, row_count: finalRowCount, committed: success },
                      }
                  );
              }

              // Audit - admin_audit_log via RPC (Phase 6.1.8 - unified admin trail)
              // This is the DRY-RUN and READ path only; committed mutations are
              // filed once, above. It stays limited to browser-user admin
              // sessions: service-role agents are already recorded in
              // execution_audit_logs above, and admin_user_id for them is not a
              // real auth.uid().
              try {
                  if (sessionUserId && !(mutating && !dryRun)) {
                      await getSupabase().rpc('fn_log_admin_action', {
                          p_admin_user_id: sessionUserId,
                          p_action: success
                              ? (dryRun ? 'admin.sql_dry_run' : 'admin.sql_executed')
                              : 'admin.sql_failed',
                          p_target_type: 'database',
                          p_target_id: null,
                          p_details: {
                              sql_preview: sql.length > 500 ? `${sql.slice(0, 500)}...` : sql,
                              sql_length: sql.length,
                              command: finalCommand,
                              row_count: finalRowCount,
                              execution_ms: ms,
                              mutating,
                              dry_run: dryRun,
                              error: errorMessage,
                          },
                          p_before_state: null,
                          p_after_state: null,
                          p_ip_address: clientIp,
                          p_user_agent: req.headers['user-agent'] || null,
                          p_request_id: req.headers['x-vercel-id'] || req.headers['x-request-id'] || null,
                      });
                  }
              } catch (auditErr) { console.warn('admin_audit_log failed', auditErr?.message || auditErr); }

              if (!success) {
                  return res.status(400).json({
                      success: false,
                      mutating,
                      dryRun,
                      committed: false,
                      error: errorMessage
                  });
              }

              return res.status(200).json({
                  success: true,
                  mutating,
                  dryRun,
                  committed: !dryRun,
                  command: finalCommand,
                  rowCount: finalRowCount,
                  rows: finalRows,
                  ms,
                  notice: dryRun
                      ? `Rolled back. This statement would have affected ${finalRowCount} row(s). Nothing was written. To commit it, send the exact same statement back in the confirm field.`
                      : null
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

      // Reachable now that a connection failure `continue`s instead of returning.
      return res.status(500).json({ success: false, error: 'Could not establish connection to the master Supabase pooler.' });

  } catch (err) {
      // This catch sits OUTSIDE the auth check - a malformed body, for
      // instance, lands here before anyone has proved who they are. Returning
      // err.message to an unauthenticated caller leaks internals. Log it
      // server-side, return a fixed string.
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[API Error] execute-sql:', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
