/**
 * Dealers API
 * GET /api/captain/dealers - List dealers
 * POST /api/captain/dealers - Add dealer
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../src/lib/captain/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleList(req, res);
  } else if (req.method === 'POST') {
    return handleCreate(req, res);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleList(req, res) {
  const { venue_id, status, skill_level } = req.query;

  if (!venue_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id required' }
    });
  }

  // Require staff auth
  const staff = await requireStaff(req, res, venue_id);
  if (!staff) return;

  try {
    let query = supabase
      .from('captain_dealers')
      .select(`
        *,
        profiles (id, display_name, avatar_url)
      `)
      .eq('venue_id', venue_id)
      .order('name', { ascending: true });

    if (status) query = query.eq('status', status);
    if (skill_level) query = query.eq('skill_level', skill_level);

    const { data: dealers, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { dealers: dealers || [] }
    });
  } catch (error) {
    console.error('List dealers error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch dealers' }
    });
  }
}

async function handleCreate(req, res) {
  const {
    venue_id,
    user_id,
    name,
    phone,
    email,
    skill_level = 'intermediate',
    certifications = [],
    games_dealt = [],
    hourly_rate,
    notes
  } = req.body;

  if (!venue_id || !name) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id and name required' }
    });
  }

  // Require manager auth to create dealers
  const staff = await requireStaff(req, res, venue_id, ['owner', 'manager']);
  if (!staff) return;

  // Verify venue exists
  const { data: venue } = await supabase
    .from('poker_venues')
    .select('id')
    .eq('id', venue_id)
    .single();

  if (!venue) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Venue not found' }
    });
  }

  try {
    const { data: dealer, error } = await supabase
      .from('captain_dealers')
      .insert({
        venue_id,
        user_id,
        name,
        phone,
        email,
        skill_level,
        certifications,
        games_dealt,
        hourly_rate,
        notes,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: { dealer }
    });
  } catch (error) {
    console.error('Create dealer error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create dealer' }
    });
  }
}
