/**
 * HORSE ANALYTICS API
 * GET /api/horses/analytics?type=summary&days=1..365
 * Returns the Phase 10 fleet content metrics for the admin dashboard.
 *
 * PHASE 1 NOTE (2026-09-02). This was the weakest route in the set: it built a
 * NEW Supabase client on every request, then spent a GoTrue network round trip
 * per call to do what the shared verifier does locally with the token it
 * already has, and it passed an unvalidated `parseInt(days)` - NaN for
 * `?days=abc` - straight into the analytics service. It is now built on
 * src/lib/horses/operatorRoute.js: console.read, one cached service-role client
 * owned by the wrapper, local JWT verification, and `days` validated to 1..365
 * before it reaches anything.
 *
 * PHASE 10 NOTE (2026-10-06). The numbers used to come from a stale JavaScript
 * mirror of the engine, imported dynamically, which read horse_analytics, a
 * table nothing live writes, so every figure it showed was empty. They now come
 * from one database function, public.fn_fleet_content_metrics(p_days), the same
 * function the weekly digest mail reads, so the page and the mail cannot
 * disagree. The function is service_role only; the wrapper's injected `db` is
 * that client, and this route adds the operator permission boundary. The
 * errors, top-horses and clips types went with the mirror: only `summary` is
 * served, anything else is a 400.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { int, enumOf } from '../../../src/lib/horses/validate.js';

const TYPES = ['summary'];
const DEFAULT_DAYS = 7;

export const spec = {
  name: 'horses.analytics',
  methods: ['GET'],
  permission: PERMISSIONS.CONSOLE_READ,
  limit: 'read',
};

/** A repeated query param arrives as an array; take the first value. */
function firstValue(value) {
  if (Array.isArray(value)) return value.length ? value[0] : undefined;
  return value;
}

/**
 * One failure sentence, written here. The database's own message is logged
 * under the route name and never reaches the operator's screen.
 */
function unavailable(reason) {
  console.error('[horses.analytics] fn_fleet_content_metrics failed:', reason);
  return new ApiError(503, 'Analytics Is Unavailable', 'analytics_unavailable');
}

export async function handle({ db, query }) {
  // `?type=summary&type=errors` made query.type an array, enumOf returned null
  // for a non-string, and the route 400'd where the original coerced.
  const type = enumOf(String(firstValue(query.type) ?? 'summary'), TYPES);
  if (!type) throw badRequest('Invalid Type Parameter');

  // `?days=abc` used to become NaN and travel all the way into the query.
  const rawDays = firstValue(query.days);
  const numDays = int(rawDays, { min: 1, max: 365, fallback: null });
  if (rawDays !== undefined && rawDays !== '' && numDays === null) {
    throw badRequest('Days Must Be Between 1 And 365');
  }
  const days = numDays ?? DEFAULT_DAYS;

  const result = await db.rpc('fn_fleet_content_metrics', { p_days: days });
  if (result.error) throw unavailable(result.error.message || 'rpc error');

  // The function returns one jsonb object with nine fixed keys. Anything else
  // means the live function is not the one this route was written against.
  const metrics = result.data;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    throw unavailable('the function returned no object');
  }

  return { data: metrics, window_days: days };
}

export default withOperatorRoute(spec, handle);
