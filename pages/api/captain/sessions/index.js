/**
 * Captain Sessions API - GET/POST /api/captain/sessions
 * List sessions or check in a player
 * Reference: Phase 2 - Session Tracking
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      });
  }
}

async function handleGet(req, res) {
  try {
    const { venue_id, player_id, status = 'active', limit = 50 } = req.query;

    let query = supabase
      .from('captain_player_sessions')
      .select(`
        *,
        profiles (
          id,
          display_name,
          avatar_url
        )
      `)
      .order('check_in_at', { ascending: false })
      .limit(parseInt(limit));

    if (venue_id) {
      query = query.eq('venue_id', venue_id);
    }

    if (player_id) {
      query = query.eq('player_id', player_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Captain sessions query error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch sessions' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { sessions: data || [] }
    });
  } catch (error) {
    console.error('Captain sessions GET error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handlePost(req, res) {
  try {
    const { venue_id, player_id, player_name } = req.body;

    if (!venue_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'venue_id is required' }
      });
    }

    if (!player_id && !player_name) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Either player_id or player_name is required' }
      });
    }

    // Check if player already has an active session at this venue
    if (player_id) {
      const { data: existing } = await supabase
        .from('captain_player_sessions')
        .select('id')
        .eq('venue_id', venue_id)
        .eq('player_id', player_id)
        .eq('status', 'active')
        .single();

      if (existing) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Player already has an active session' }
        });
      }
    }

    const { data: session, error } = await supabase
      .from('captain_player_sessions')
      .insert({
        venue_id,
        player_id: player_id || null,
        player_name: player_name || null,
        status: 'active',
        check_in_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Captain session create error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to create session' }
      });
    }

    return res.status(201).json({
      success: true,
      data: { session }
    });
  } catch (error) {
    console.error('Captain sessions POST error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
