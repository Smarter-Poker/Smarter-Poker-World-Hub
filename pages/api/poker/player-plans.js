import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { contributionPrivate, contributionSession, contributionBody } from '../../../src/lib/poker-near-me/venueContributionsServer';
import { planningUuid, planningInvalid, validatePlanMutation } from '../../../src/lib/poker-near-me/playerPlanning';
import { planningError, planningRpc } from '../../../src/lib/poker-near-me/playerPlanningServer';

export const config = { api: { bodyParser: { sizeLimit: '24kb' } } };
export default async function handler(req, res) {
  contributionPrivate(res);
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ success: false, error: 'Method not allowed' }); }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  let operationId;
  try {
    const session = await contributionSession(req, res); if (!session) return;
    if (req.method === 'GET') {
      if (req.query.operation_id) {
        const result = await planningRpc(session.client, 'pnm_player_plan_operation', { p_request_id: planningUuid(req.query.operation_id) }, null, true);
        return res.status(200).json({ success: true, operation: result });
      }
      if (req.query.kind && !['search', 'trip'].includes(req.query.kind)) throw planningInvalid('Invalid plan kind');
      let query = session.client.from('pnm_player_plans').select('id,kind,name,document,revision,created_at,updated_at').eq('user_id', session.user.id).order('updated_at', { ascending: false }).order('id', { ascending: true });
      if (req.query.kind) query = query.eq('kind', req.query.kind);
      const { data, error } = await query.limit(70); if (error) throw error;
      return res.status(200).json({ success: true, plans: data || [] });
    }
    const validated = validatePlanMutation(contributionBody(req)); operationId = validated.operation_id;
    const receipt = await planningRpc(session.client, 'pnm_mutate_player_plan', { p_request_id: operationId, p_payload: validated.payload }, operationId);
    return res.status(validated.payload.action === 'create' ? 201 : 200).json({ success: true, ...receipt });
  } catch (error) { return planningError(res, error, operationId); }
}
