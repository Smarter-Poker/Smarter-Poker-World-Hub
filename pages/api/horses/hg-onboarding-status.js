/**
 * /api/horses/hg-onboarding-status
 *   GET ?userId=<uuid> - fn_get_home_games_onboarding_status_admin
 *
 * Customer-support lookup. It returns another player's onboarding state, so it
 * is audited: reading a user's record on their behalf is a support action, and
 * a support action that leaves no trace cannot be reviewed.
 *
 * Built on withHgOperatorRoute: `userDb` speaks as the caller so auth.uid()
 * resolves inside the SECURITY DEFINER RPC.
 */
import { withHgOperatorRoute } from '../../../src/lib/horses/hgOperator.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { uuid } from '../../../src/lib/horses/validate.js';

export const spec = {
  name: 'horses.hg-onboarding-status',
  methods: ['GET'],
  permission: PERMISSIONS.PLAYERS_READ,
  limit: 'read',
};

export async function handle({ req, op, userDb, query }) {
  const userId = uuid(query.userId);
  if (!userId) throw badRequest('A Valid User Id Is Required', 'invalid_user_id');

  const { data, error } = await userDb.rpc('fn_get_home_games_onboarding_status_admin', {
    p_caller_user_id: op.user.id,
    p_target_user_id: userId,
  });
  if (error) {
    console.warn('[hg-onboarding-status GET]', error.message || error);
    throw new ApiError(500, 'The Onboarding Status Could Not Be Loaded', 'onboarding_read_failed');
  }

  await auditOperatorAction(op, req, {
    action: 'support.lookup_onboarding',
    targetType: 'user',
    targetId: userId,
    details: { found: data !== null && data !== undefined },
  });

  return { status: data, user_id: userId };
}

export default withHgOperatorRoute(spec, handle);
