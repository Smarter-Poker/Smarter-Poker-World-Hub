/**
 * Self-Exclusion API
 * POST /api/commander/responsible-gaming/exclusion
 * DELETE /api/commander/responsible-gaming/exclusion
 */
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    return handleCreate(req, res);
  } else if (req.method === 'DELETE') {
    return handleRemove(req, res);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleCreate(req, res) {
  // Require auth - players can only self-exclude themselves
  const user = await requireAuth(req, res);
  if (!user) return;

  const { venue_id, duration_days, reason } = req.body;

  if (!duration_days) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'duration_days required' }
    });
  }

  try {
    const start_date = new Date();
    const end_date = new Date();
    end_date.setDate(end_date.getDate() + parseInt(duration_days));

    const { data: exclusion, error } = await supabase
      .from('commander_self_exclusions')
      .insert({
        player_id: user.id,
        venue_id, // null for all venues
        start_date: start_date.toISOString(),
        end_date: end_date.toISOString(),
        reason,
        exclusion_status: 'active',
        requested_by: 'player'
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: { exclusion }
    });
  } catch (error) {
    console.error('Create exclusion error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create exclusion' }
    });
  }
}

async function handleRemove(req, res) {
  // Require auth - players can only lift their own exclusions
  const user = await requireAuth(req, res);
  if (!user) return;

  const { exclusion_id } = req.body;

  if (!exclusion_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'exclusion_id required' }
    });
  }

  try {
    // Check if exclusion allows early removal and belongs to this user
    const { data: exclusion } = await supabase
      .from('commander_self_exclusions')
      .select('*')
      .eq('id', exclusion_id)
      .eq('player_id', user.id)
      .single();

    if (!exclusion) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Exclusion not found' }
      });
    }

    // Self-exclusions typically have cooling-off periods
    const minCoolingDays = 7;
    const daysSinceStart = Math.floor(
      (Date.now() - new Date(exclusion.start_date).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceStart < minCoolingDays) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'COOLING_PERIOD',
          message: `Cannot remove exclusion for ${minCoolingDays - daysSinceStart} more days`
        }
      });
    }

    const { error } = await supabase
      .from('commander_self_exclusions')
      .update({
        exclusion_status: 'lifted',
        lifted_at: new Date().toISOString()
      })
      .eq('id', exclusion_id);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { message: 'Exclusion lifted' }
    });
  } catch (error) {
    console.error('Remove exclusion error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to remove exclusion' }
    });
  }
}
