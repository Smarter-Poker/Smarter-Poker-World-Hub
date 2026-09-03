/**
 * HORSE ANALYTICS API
 * GET /api/horses/analytics?type=summary|errors|top-horses|clips&days=1..365
 * Returns metrics for the admin dashboard.
 *
 * PHASE 1 NOTE (2026-09-02). This was the weakest route in the set: it built a
 * NEW Supabase client on every request, then spent a GoTrue network round trip
 * per call to do what the shared verifier does locally with the token it
 * already has, and it passed an unvalidated `parseInt(days)` - NaN for
 * `?days=abc` - straight into the analytics service. It is now built on src/lib/horses/operatorRoute.js:
 * console.read, one cached service-role client owned by the wrapper, local JWT
 * verification, and `days` validated to 1..365 before it reaches anything.
 *
 * HorseAlertingService is imported dynamically inside the handler. It reaches
 * for the content-engine pipeline, which is a different deployment unit from
 * this console, and a module-scope import made every request to this route pay
 * for that graph even when the type parameter never used it.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { int, enumOf } from '../../../src/lib/horses/validate.js';

const TYPES = ['summary', 'errors', 'top-horses', 'clips'];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';

/** The wrapper has already refused the request if this is missing. */
function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export const spec = {
  name: 'horses.analytics',
  methods: ['GET'],
  permission: PERMISSIONS.CONSOLE_READ,
  limit: 'read',
};

/**
 * Run one analytics service call with the service's own errors kept OUT of the
 * response.
 *
 * `scrubError` only replaces messages that LOOK like database text; anything
 * else is returned to the browser verbatim, first 200 characters. So any error
 * HorseAlertingService throws - a fetch failure carrying an internal URL, a
 * TypeError naming a private field - reached the operator's screen, where the
 * original route had always returned the fixed string 'Failed to load
 * analytics'. Every call now becomes one 503 with a sentence this file wrote.
 */
async function callAnalytics(label, run) {
  try {
    return await run();
  } catch (err) {
    console.error(`[horses.analytics] ${label} failed:`, err?.message || err);
    throw new ApiError(503, 'Analytics Is Unavailable', 'analytics_unavailable');
  }
}

/** A repeated query param arrives as an array; take the first value. */
function firstValue(value) {
  if (Array.isArray(value)) return value.length ? value[0] : undefined;
  return value;
}

export async function handle({ query }) {
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
  const days = numDays ?? 7;

  let HorseAlertingService;
  let ClipUsageTracker;
  try {
    ({ HorseAlertingService, ClipUsageTracker } = await import(
      '../../../src/content-engine/pipeline/HorseAlertingService.js'
    ));
  } catch (err) {
    console.error('[horses.analytics] alerting service unavailable:', err?.message);
    throw new ApiError(503, 'Analytics Is Unavailable', 'analytics_unavailable');
  }

  const alertingService = await callAnalytics(
    'construct',
    async () => new HorseAlertingService(SUPABASE_URL, serviceKey())
  );

  if (type === 'summary') {
    return { data: await callAnalytics('summary', () => alertingService.getAnalyticsSummary(days)) };
  }

  if (type === 'errors') {
    const [recent, breakdown] = await callAnalytics('errors', () =>
      Promise.all([alertingService.getRecentErrors(20), alertingService.getErrorBreakdown(days)])
    );
    return { data: { recent, breakdown } };
  }

  if (type === 'top-horses') {
    return { data: await callAnalytics('top-horses', () => alertingService.getTopHorses(days, 10)) };
  }

  const usedClips = await callAnalytics('clips', async () => {
    const tracker = new ClipUsageTracker(SUPABASE_URL, serviceKey());
    return tracker.getRecentlyUsedClips(24);
  });
  const clips = usedClips || [];
  return { data: { usedInLast24h: clips.length, clips } };
}

export default withOperatorRoute(spec, handle);
