/**
 * Single Union API
 * GET /api/captain/unions/[id] - Get union details
 * PUT /api/captain/unions/[id] - Update union
 * DELETE /api/captain/unions/[id] - Delete union
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Union ID required' }
    });
  }

  if (req.method === 'GET') {
    return getUnion(req, res, id);
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    return updateUnion(req, res, id);
  }

  if (req.method === 'DELETE') {
    return deleteUnion(req, res, id);
  }

  res.setHeader('Allow', ['GET', 'PUT', 'PATCH', 'DELETE']);
  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function getUnion(req, res, id) {
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

    // Get union with venues and agents
    const { data: union, error } = await supabase
      .from('captain_unions')
      .select(`
        *,
        captain_union_venues (
          id,
          venue_id,
          tier,
          revenue_share,
          status,
          joined_at,
          poker_venues:venue_id (id, name, city, state, address)
        ),
        captain_agents (
          id,
          display_name,
          agent_code,
          role,
          status,
          total_players_referred,
          total_commission_earned,
          created_at,
          profiles:user_id (id, display_name, avatar_url)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !union) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Union not found' }
      });
    }

    // Check if user has access (owner or agent)
    const isOwner = union.owner_id === user.id;
    const agentRecord = union.captain_agents?.find(a =>
      a.profiles?.id === user.id || a.user_id === user.id
    );

    if (!isOwner && !agentRecord) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to this union' }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        union,
        is_owner: isOwner,
        agent_role: agentRecord?.role || null
      }
    });
  } catch (error) {
    console.error('Get union error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function updateUnion(req, res, id) {
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

    // Check ownership
    const { data: existing } = await supabase
      .from('captain_unions')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Union not found' }
      });
    }

    if (existing.owner_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the owner can update this union' }
      });
    }

    const allowedFields = [
      'name', 'description', 'logo_url', 'website',
      'contact_email', 'contact_phone', 'settings',
      'default_revenue_share', 'status'
    ];

    const updates = { updated_at: new Date().toISOString() };
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const { data: union, error } = await supabase
      .from('captain_unions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update union error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update union' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { union }
    });
  } catch (error) {
    console.error('Update union API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function deleteUnion(req, res, id) {
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

    // Check ownership
    const { data: existing } = await supabase
      .from('captain_unions')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Union not found' }
      });
    }

    if (existing.owner_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the owner can delete this union' }
      });
    }

    const { error } = await supabase
      .from('captain_unions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete union error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to delete union' }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Union deleted successfully'
    });
  } catch (error) {
    console.error('Delete union API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
