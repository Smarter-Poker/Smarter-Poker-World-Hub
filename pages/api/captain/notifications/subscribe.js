/**
 * Push Notifications Subscribe API
 * POST /api/captain/notifications/subscribe - Subscribe to push notifications
 * DELETE /api/captain/notifications/subscribe - Unsubscribe from push notifications
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    return subscribe(req, res);
  }

  if (req.method === 'DELETE') {
    return unsubscribe(req, res);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function subscribe(req, res) {
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

    const { subscription, platform, device_id, venue_id } = req.body;

    if (!subscription) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'subscription object required' }
      });
    }

    // Check for existing subscription with this endpoint
    const endpoint = subscription.endpoint;
    const { data: existing } = await supabase
      .from('captain_push_subscriptions')
      .select('id')
      .eq('endpoint', endpoint)
      .single();

    if (existing) {
      // Update existing subscription
      const { data: updated, error } = await supabase
        .from('captain_push_subscriptions')
        .update({
          user_id: user.id,
          subscription_data: subscription,
          platform: platform || 'web',
          device_id,
          venue_id: venue_id ? parseInt(venue_id) : null,
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: { subscription: updated, updated: true }
      });
    }

    // Create new subscription
    const { data: newSub, error } = await supabase
      .from('captain_push_subscriptions')
      .insert({
        user_id: user.id,
        endpoint,
        subscription_data: subscription,
        platform: platform || 'web',
        device_id,
        venue_id: venue_id ? parseInt(venue_id) : null,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: { subscription: newSub, created: true }
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to subscribe' }
    });
  }
}

async function unsubscribe(req, res) {
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

    const { endpoint, device_id } = req.body;

    if (!endpoint && !device_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'endpoint or device_id required' }
      });
    }

    let query = supabase
      .from('captain_push_subscriptions')
      .update({ is_active: false })
      .eq('user_id', user.id);

    if (endpoint) {
      query = query.eq('endpoint', endpoint);
    } else if (device_id) {
      query = query.eq('device_id', device_id);
    }

    const { error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { message: 'Unsubscribed successfully' }
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to unsubscribe' }
    });
  }
}
