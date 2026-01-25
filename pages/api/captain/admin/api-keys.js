/**
 * API Keys Management
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6
 * GET /api/captain/admin/api-keys - List API keys
 * POST /api/captain/admin/api-keys - Create new API key
 * DELETE /api/captain/admin/api-keys/[id] - Revoke API key
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { withRateLimit } from '../../../../src/lib/captain/rateLimit';
import { logAction, AuditActions } from '../../../../src/lib/captain/audit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (req.method === 'GET') {
    return listApiKeys(req, res, user);
  }

  if (req.method === 'POST') {
    return createApiKey(req, res, user);
  }

  if (req.method === 'DELETE') {
    return revokeApiKey(req, res, user);
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listApiKeys(req, res, user) {
  try {
    const { venue_id } = req.query;

    if (!venue_id) {
      return res.status(400).json({ error: 'Venue ID required' });
    }

    // Check if owner
    const { data: staff } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff || staff.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }

    const { data: keys, error } = await supabase
      .from('captain_api_keys')
      .select('id, name, key_prefix, permissions, rate_limit, is_active, last_used_at, use_count, created_at, expires_at')
      .eq('venue_id', parseInt(venue_id))
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({ api_keys: keys });
  } catch (error) {
    console.error('List API keys error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function createApiKey(req, res, user) {
  try {
    const {
      venue_id,
      name,
      permissions = [],
      rate_limit = 1000,
      allowed_ips = [],
      expires_in_days
    } = req.body;

    if (!venue_id || !name) {
      return res.status(400).json({ error: 'Venue ID and name required' });
    }

    // Check if owner
    const { data: staff } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff || staff.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }

    // Generate API key
    const rawKey = `captain_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 16);

    // Calculate expiration
    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data: apiKey, error } = await supabase
      .from('captain_api_keys')
      .insert({
        venue_id: parseInt(venue_id),
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        permissions,
        rate_limit,
        allowed_ips: allowed_ips.length > 0 ? allowed_ips : null,
        created_by: user.id,
        expires_at: expiresAt
      })
      .select('id, name, key_prefix, permissions, rate_limit, created_at, expires_at')
      .single();

    if (error) throw error;

    // Log audit
    await logAction(AuditActions.ADMIN_ACTION, {
      venueId: venue_id,
      userId: user.id,
      staffId: staff.id,
      actorType: 'staff',
      targetType: 'api_key',
      targetId: apiKey.id,
      metadata: { action: 'create_api_key', name },
      req
    });

    return res.status(201).json({
      api_key: {
        ...apiKey,
        // Only return the full key once on creation
        key: rawKey
      },
      message: 'API key created. Save this key - it will not be shown again.'
    });
  } catch (error) {
    console.error('Create API key error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function revokeApiKey(req, res, user) {
  try {
    const { key_id, venue_id } = req.body;

    if (!key_id || !venue_id) {
      return res.status(400).json({ error: 'Key ID and venue ID required' });
    }

    // Check if owner
    const { data: staff } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff || staff.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }

    // Revoke key
    const { error } = await supabase
      .from('captain_api_keys')
      .update({ is_active: false })
      .eq('id', key_id)
      .eq('venue_id', parseInt(venue_id));

    if (error) throw error;

    // Log audit
    await logAction(AuditActions.ADMIN_ACTION, {
      venueId: venue_id,
      userId: user.id,
      staffId: staff.id,
      actorType: 'staff',
      targetType: 'api_key',
      targetId: key_id,
      metadata: { action: 'revoke_api_key' },
      req
    });

    return res.status(200).json({ message: 'API key revoked' });
  } catch (error) {
    console.error('Revoke API key error:', error);
    return res.status(500).json({ error: error.message });
  }
}

export default withRateLimit(handler, 'write');
