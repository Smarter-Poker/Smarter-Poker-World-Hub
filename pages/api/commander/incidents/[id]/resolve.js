/**
 * Resolve Incident API
 * POST /api/commander/incidents/:id/resolve
 */
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { guardStaff } from '../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  // Auth guard: require staff auth
  const _staff = await guardStaff(req, res);
  if (!_staff) return;

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
    });
  }

  const { id } = req.query;
  const { resolved_by, resolution_notes, follow_up_required = false } = req.body;

  if (!resolved_by || !resolution_notes) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'resolved_by and resolution_notes required' }
    });
  }

  try {
    const { data: incident, error } = await supabase
      .from('commander_incidents')
      .update({
        incident_status: 'resolved',
        resolved_by,
        resolution_notes,
        follow_up_required,
        resolved_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { incident }
    });
  } catch (error) {
    console.error('Resolve incident error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to resolve incident' }
    });
  }
}
