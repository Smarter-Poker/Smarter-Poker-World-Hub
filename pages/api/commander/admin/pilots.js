/**
 * Commander Admin Pilots API
 * GET /api/commander/admin/pilots - List pilot venues with metrics
 * Reference: Phase 6 - Scale & Polish
 */
import { createClient } from '@supabase/supabase-js';
import { captureException } from '../../../../src/lib/commander/errorMonitoring';
import { guardManager } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // Auth guard: require manager auth
  const _staff = await guardManager(req, res);
  if (!_staff) return;

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  try {
    const { status } = req.query;

    let query = supabase
      .from('commander_pilot_venues')
      .select(`
        *,
        poker_venues (
          id,
          name,
          city,
          state
        )
      `)
      .order('pilot_start_date', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Commander admin pilots query error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch pilots' }
      });
    }

    // Map to expected format
    const pilots = (data || []).map(pilot => ({
      id: pilot.id,
      venue_id: pilot.venue_id,
      venue_name: pilot.poker_venues?.name || 'Unknown Venue',
      city: pilot.poker_venues?.city || '',
      state: pilot.poker_venues?.state || '',
      pilot_start_date: pilot.pilot_start_date,
      pilot_end_date: pilot.pilot_end_date,
      status: pilot.status,
      uptime_percentage: parseFloat(pilot.uptime_percentage) || 0,
      support_tickets_count: pilot.support_tickets_count || 0,
      staff_satisfaction_score: parseFloat(pilot.staff_satisfaction_score) || 0,
      player_adoption_percentage: parseFloat(pilot.player_adoption_percentage) || 0,
      weekly_reports: pilot.weekly_reports || [],
      final_assessment: pilot.final_assessment,
      converted_to_paid: pilot.converted_to_paid,
      conversion_date: pilot.conversion_date,
      created_at: pilot.created_at,
      updated_at: pilot.updated_at
    }));

    return res.status(200).json({
      success: true,
      pilots
    });
  } catch (error) {
    captureException(error, {
      action: 'admin_pilots_list',
      endpoint: '/api/commander/admin/pilots'
    };
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
