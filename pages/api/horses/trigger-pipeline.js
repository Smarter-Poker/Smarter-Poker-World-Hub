/**
 * POST /api/horses/trigger-pipeline
 *
 * NOT BUILT. Returns 501 { code: 'not_built' } through the operator wrapper, so
 * the console can show an honest Not Built Yet state instead of a disabled
 * button next to a paragraph of explanation.
 *
 * Two things are deliberately NOT done here, and must not be reintroduced:
 *
 *   1. No pipeline_runs row is written. This route used to fetch
 *      `/api/cron/horses-stories`, which does not exist anywhere under
 *      pages/api/cron/ (the horses-* cron files live in archive/cron/ and are
 *      not routable). The fetch 404'd, the subsequent .json() threw, the throw
 *      was swallowed, and the route returned { success: true } after writing a
 *      pipeline_runs row for a run that never happened. Logging a run that did
 *      not execute is what made the lie durable.
 *
 *   2. No self-fetch. The old code built its target from req.headers.host and
 *      sent `Bearer ${process.env.CRON_SECRET}` to it, so a spoofed Host header
 *      exfiltrated CRON_SECRET to an attacker-chosen server. Removing the
 *      self-call removes the vector outright. If this is ever implemented,
 *      derive the base URL from process.env.NEXT_PUBLIC_SITE_URL or
 *      process.env.VERCEL_URL and NEVER from a request header.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { enumOf } from '../../../src/lib/horses/validate.js';

/** The four pipeline types the original route accepted. The allowlist is kept
 *  so a typo or a wrong body shape is still told what it got wrong: without it
 *  every malformed call answered 501 alongside every correct one, and the
 *  caller could not tell a mistake from an unbuilt feature. */
export const PIPELINE_TYPES = ['test', 'cycle', 'daily', 'publish'];

export const spec = {
  name: 'horses.trigger-pipeline',
  methods: ['POST'],
  permission: PERMISSIONS.FLEET_WRITE,
  limit: 'write',
};

export async function handle({ body } = {}) {
  const requested = (body && body.type) ?? 'test';
  if (!enumOf(requested, PIPELINE_TYPES)) {
    throw badRequest(
      'Pipeline Type Must Be One Of: ' + PIPELINE_TYPES.join(', '),
      'invalid_pipeline_type'
    );
  }
  throw new ApiError(501, 'Not Built Yet', 'not_built');
}

export default withOperatorRoute(spec, handle);
