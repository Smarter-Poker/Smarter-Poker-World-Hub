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

export async function handle({ query }) {
  const type = enumOf(query.type || 'summary', TYPES);
  if (!type) throw badRequest('Invalid Type Parameter');

  // `?days=abc` used to become NaN and travel all the way into the query.
  const numDays = int(query.days, { min: 1, max: 365, fallback: null });
  if (query.days !== undefined && query.days !== '' && numDays === null) {
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

  const alertingService = new HorseAlertingService(SUPABASE_URL, serviceKey());

  if (type === 'summary') {
    return { data: await alertingService.getAnalyticsSummary(days) };
  }

  if (type === 'errors') {
    const [recent, breakdown] = await Promise.all([
      alertingService.getRecentErrors(20),
      alertingService.getErrorBreakdown(days),
    ]);
    return { data: { recent, breakdown } };
  }

  if (type === 'top-horses') {
    return { data: await alertingService.getTopHorses(days, 10) };
  }

  const tracker = new ClipUsageTracker(SUPABASE_URL, serviceKey());
  const usedClips = await tracker.getRecentlyUsedClips(24);
  return { data: { usedInLast24h: usedClips.length, clips: usedClips } };
}

export default withOperatorRoute(spec, handle);
