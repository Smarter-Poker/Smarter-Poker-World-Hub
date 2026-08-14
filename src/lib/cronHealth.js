/**
 * cronHealth — the writer cron_health_log never had.
 *
 * WHY (audit 2026-08-12 → built 2026-08-14)
 * `/api/admin/cron-health` reads `cron_health_log` to report job health. The
 * table had a CREATE TABLE, RLS policies, a UNIQUE key on cron_name — and
 * ZERO writers anywhere (this repo, the workers repo, the Open Claw
 * dispatcher). It has therefore held zero rows for its entire life, and the
 * monitor could only ever say "0/N healthy". The dashboard was made honest
 * (NO_TELEMETRY) on the 12th; this module is the missing supply side.
 *
 * USAGE — wrap the default export of any pages/api/cron/* handler:
 *
 *     import { withCronHealth } from '../../../src/lib/cronHealth';
 *     async function handler(req, res) { ... }
 *     export default withCronHealth('cleanup-stale-streams', handler);
 *
 * BEHAVIOUR
 *   - Upserts one row per cron_name (the table's UNIQUE key) with
 *     last_run_at, last_status ('ok' | 'http_<code>' | 'error'),
 *     last_duration_ms and error_message.
 *   - FAIL-OPEN: a telemetry failure can never break the job. The upsert is
 *     wrapped and its errors are logged, not thrown. The handler's own
 *     behaviour — including thrown errors — is passed through untouched.
 *   - 401/403 runs are NOT recorded. Every handler gates on CRON_SECRET, so
 *     an unauthorized hit is a stranger probing the URL, not a run; letting
 *     it write would let anyone on the internet overwrite last_run_at and
 *     poison the freshness signal.
 */
import { createClient } from '@supabase/supabase-js';

let _client = null;
function getServiceClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null; // recorded as a skip, never a crash
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}

export function withCronHealth(cronName, handler) {
  return async function cronHealthWrapped(req, res) {
    const started = Date.now();
    let recorded = false;

    // Record BEFORE the response is flushed. On Vercel, the invocation can be
    // frozen the moment the response ends — the first deployment of this
    // wrapper recorded in a `finally` AFTER the handler returned, and the
    // in-flight upsert was killed with it: probes returned 200 and
    // cron_health_log stayed at zero rows. The write has to happen while the
    // response is still open, so res.json / res.end / res.send are
    // intercepted and the telemetry upsert is awaited FIRST.
    const record = async (thrown) => {
      if (recorded) return;
      recorded = true;
      try {
        const code = res?.statusCode || 0;
        // Unauthorized hits are strangers probing the URL, not runs.
        if (code === 401 || code === 403) return;
        const client = getServiceClient();
        if (!client) return;
        const status = thrown ? 'error' : code >= 400 ? `http_${code}` : 'ok';
        const { error: telemetryErr } = await client
          .from('cron_health_log')
          .upsert(
            {
              cron_name: cronName,
              last_run_at: new Date().toISOString(),
              last_status: status,
              last_duration_ms: Date.now() - started,
              error_message: thrown ? String(thrown?.message || thrown).slice(0, 500) : null,
            },
            { onConflict: 'cron_name' }
          );
        if (telemetryErr) {
          console.warn('[cronHealth]', cronName, 'telemetry write failed:', telemetryErr.message);
        }
      } catch (telemetryErr) {
        // Fail-open by design: the job's outcome must never depend on telemetry.
        console.warn('[cronHealth]', cronName, 'telemetry threw:', telemetryErr?.message || telemetryErr);
      }
    };

    // Intercept every way a Pages-router response can end. `res.status(...)`
    // sets statusCode synchronously before .json()/.send() runs, so the code
    // is already correct when we record.
    for (const method of ['json', 'send', 'end']) {
      const original = res[method]?.bind(res);
      if (!original) continue;
      res[method] = (...args) => {
        // json/send/end are sync-returning; we must flush telemetry first.
        // Returning the promise keeps Next awaiting until both are done.
        return record(null).then(() => original(...args));
      };
    }

    try {
      return await handler(req, res);
    } catch (err) {
      // Handler died before responding — record the failure, then rethrow.
      await record(err);
      throw err;
    }
  };
}

export default { withCronHealth };
