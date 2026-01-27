/**
 * Service Request API
 * POST /api/captain/services/request - Submit a service request
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
    });
  }

  try {
    const {
      venue_id,
      request_type,
      details,
      table_id,
      table_number,
      seat_number
    } = req.body;

    if (!venue_id || !request_type) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'venue_id and request_type are required' }
      });
    }

    // Validate request type
    const validTypes = ['food', 'chips', 'table_change', 'cashout', 'floor'];
    if (!validTypes.includes(request_type)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TYPE', message: 'Invalid request type' }
      });
    }

    // Check for existing pending request of same type
    const { data: existingRequest } = await supabase
      .from('captain_service_requests')
      .select('id')
      .eq('player_id', user.id)
      .eq('venue_id', parseInt(venue_id))
      .eq('request_type', request_type)
      .in('status', ['pending', 'in_progress'])
      .single();

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        error: { code: 'DUPLICATE_REQUEST', message: 'You already have a pending request of this type' }
      });
    }

    // Create the service request
    const { data: request, error } = await supabase
      .from('captain_service_requests')
      .insert({
        player_id: user.id,
        venue_id: parseInt(venue_id),
        table_id: table_id ? parseInt(table_id) : null,
        request_type,
        details,
        status: 'pending',
        metadata: {
          table_number,
          seat_number
        }
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: {
        request: {
          ...request,
          table_number,
          seat_number
        }
      }
    });
  } catch (error) {
    console.error('Create service request error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create service request' }
    });
  }
}
