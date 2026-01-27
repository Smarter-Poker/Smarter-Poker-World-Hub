/**
 * API Keys Management
 * GET /api/captain/admin/api-keys - List API keys
 * POST /api/captain/admin/api-keys - Create API key
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateApiKey() {
  return `cptn_${crypto.randomBytes(24).toString('hex')}`;
}

export default async function handler(req, res) {
  try {
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

    // Verify user has admin privileges (check if they're owner/manager of any venue)
    const { data: staffRoles } = await supabase
      .from('captain_staff')
      .select('venue_id, role')
      .eq('user_id', user.id)
      .in('role', ['owner', 'manager']);

    if (!staffRoles || staffRoles.length === 0) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' }
      });
    }

    const venueIds = staffRoles.map(s => s.venue_id);

    if (req.method === 'GET') {
      const { data: keys, error } = await supabase
        .from('captain_api_keys')
        .select('*')
        .in('venue_id', venueIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: { keys: keys || [] }
      });
    }

    if (req.method === 'POST') {
      const { name, venue_id } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_NAME', message: 'Key name required' }
        });
      }

      const targetVenueId = venue_id || venueIds[0];

      // Verify user has access to this venue
      if (!venueIds.includes(targetVenueId)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No access to this venue' }
        });
      }

      const apiKey = generateApiKey();

      const { data, error } = await supabase
        .from('captain_api_keys')
        .insert({
          venue_id: targetVenueId,
          created_by: user.id,
          name,
          api_key: apiKey,
          permissions: ['read'],
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: { key: data }
      });
    }

    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET and POST allowed' }
    });
  } catch (error) {
    console.error('API keys error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to process request' }
    });
  }
}
