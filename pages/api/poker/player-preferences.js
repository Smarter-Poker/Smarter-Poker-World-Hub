import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { contributionPrivate, contributionSession, contributionBody } from '../../../src/lib/poker-near-me/venueContributionsServer';
import { planningUuid, planningObject, validatePreferencePatch } from '../../../src/lib/poker-near-me/playerPlanning';
import { planningError, planningRpc } from '../../../src/lib/poker-near-me/playerPlanningServer';

export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };
export default async function handler(req, res) {
  contributionPrivate(res);
  if (!['GET', 'PATCH'].includes(req.method)) { res.setHeader('Allow', 'GET, PATCH'); return res.status(405).json({ success: false, error: 'Method not allowed' }); }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  let operationId;
  try {
    const session = await contributionSession(req, res); if (!session) return;
    if (req.method === 'GET') {
      if (req.query.operation_id) return res.status(200).json({ success: true, operation: await planningRpc(session.client, 'pnm_player_plan_operation', { p_request_id: planningUuid(req.query.operation_id) }, null, true) });
      const { data, error } = await session.service.from('profiles').select('poker_near_me_preferences').eq('id', session.user.id).maybeSingle();
      if (error) throw error;
      if (!data) throw Object.assign(new Error('Profile not found'), { code: 'P0002' });
      return res.status(200).json({ success: true, preferences: data?.poker_near_me_preferences || {} });
    }
    const body = planningObject(contributionBody(req), ['operation_id', 'patch'], 'preference request');
    operationId = planningUuid(body.operation_id); const patch = validatePreferencePatch(body.patch);
    return res.status(200).json({ success: true, ...await planningRpc(session.client, 'pnm_patch_preferences', { p_request_id: operationId, p_patch: patch }, operationId) });
  } catch (error) { return planningError(res, error, operationId); }
}
