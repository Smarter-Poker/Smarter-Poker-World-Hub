/**
 * API Key Management
 * DELETE /api/commander/admin/api-keys/[id] - Delete API key
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only DELETE allowed' }
    });
  }

  try {
    const { id } = req.query;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
      });
    }

    // Get the key to verify ownership
    const { data: key, error: keyError } = await supabase
      .from('commander_api_keys')
      .select('*, venue:venue_id (*)')
      .eq('id', id)
      .single();

    if (keyError || !key) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'API key not found' }
      });
    }

    // Verify user has admin access to the venue
    const { data: staffRole } = await supabase
      .from('commander_staff')
      .select('role')
      .eq('user_id', user.id)
      .eq('venue_id', key.venue_id)
      .in('role', ['owner', 'manager'])
      .single();

    if (!staffRole) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'No access to delete this key' }
      });
    }

    const { error: deleteError } = await supabase
      .from('commander_api_keys')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return res.status(200).json({
      success: true,
      data: { deleted: true }
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete API key' }
    });
  }
}
