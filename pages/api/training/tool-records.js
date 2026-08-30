import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const SAFE_KEY = /^[a-z0-9][a-z0-9_.:-]{0,159}$/i;

function validObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export default async function handler(req, res) {
  withTiming(res);
  const limitGroup = req.method === 'GET' ? LIMITS.read : LIMITS.write;
  if (!applyRateLimit(req, res, limitGroup)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
  const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
  if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  try {
    if (req.method === 'GET') {
      const toolId = String(req.query.toolId || '');
      const recordType = req.query.recordType ? String(req.query.recordType) : '';
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
      if (!SAFE_ID.test(toolId) || (recordType && !SAFE_ID.test(recordType))) {
        return res.status(400).json({ success: false, error: 'Invalid tool or record type' });
      }

      let query = getSupabase()
        .from('training_tool_records')
        .select('id, tool_id, record_type, record_key, data, created_at, updated_at')
        .eq('user_id', user.id)
        .eq('tool_id', toolId)
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (recordType) query = query.eq('record_type', recordType);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ success: true, records: data || [] });
    }

    if (req.method === 'POST') {
      const toolId = String(req.body?.toolId || '');
      const recordType = String(req.body?.recordType || 'state');
      const recordKey = String(req.body?.recordKey || '');
      const data = req.body?.data;
      if (!SAFE_ID.test(toolId) || !SAFE_ID.test(recordType) || !SAFE_KEY.test(recordKey)) {
        return res.status(400).json({ success: false, error: 'Invalid tool record identifiers' });
      }
      if (!validObject(data)) {
        return res.status(400).json({ success: false, error: 'data must be an object' });
      }
      if (JSON.stringify(data).length > 65536) {
        return res.status(413).json({ success: false, error: 'Tool record is too large' });
      }

      const now = new Date().toISOString();
      const { data: saved, error } = await getSupabase()
        .from('training_tool_records')
        .upsert({
          user_id: user.id,
          tool_id: toolId,
          record_type: recordType,
          record_key: recordKey,
          data,
          updated_at: now,
        }, { onConflict: 'user_id,tool_id,record_key' })
        .select('id, tool_id, record_type, record_key, data, created_at, updated_at')
        .single();
      if (error) throw error;
      return res.status(200).json({ success: true, record: saved });
    }

    if (req.method === 'DELETE') {
      const toolId = String(req.body?.toolId || '');
      const recordKey = String(req.body?.recordKey || '');
      if (!SAFE_ID.test(toolId) || !SAFE_KEY.test(recordKey)) {
        return res.status(400).json({ success: false, error: 'Invalid tool record identifiers' });
      }
      const { error } = await getSupabase()
        .from('training_tool_records')
        .delete()
        .eq('user_id', user.id)
        .eq('tool_id', toolId)
        .eq('record_key', recordKey);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.warn('[TrainingToolRecords]', error?.message || error);
    return res.status(500).json({ success: false, error: 'Training tool record request failed' });
  }
}
