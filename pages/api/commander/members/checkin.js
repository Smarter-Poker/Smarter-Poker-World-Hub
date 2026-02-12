/**
 * Member Check-In API
 * POST /api/commander/members/checkin
 * Records a member check-in with timestamp
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Auth guard: require staff auth for write operations
  const _authResult = await guardWriteStaff(req, res);
  if (!_authResult) return;

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const { member_id } = req.body;
    if (!member_id) return res.status(400).json({ success: false, error: 'member_id required' });

    // Increment visit count (two-step since supabase.raw() is not supported in JS v2)
    const { data: currentMember } = await supabase
      .from('commander_members')
      .select('visit_count')
      .eq('id', member_id)
      .single();

    const { data: member, error: memberError } = await supabase
      .from('commander_members')
      .update({
        last_checkin: new Date().toISOString(),
        visit_count: (currentMember?.visit_count || 0) + 1
      })
      .eq('id', member_id)
      .select()
      .single();

    // Also log the check-in event
    await supabase.from('commander_checkins').insert({
      member_id,
      venue_id: member?.venue_id,
      checked_in_at: new Date().toISOString()
    }).catch(() => {}); // Non-fatal if table doesn't exist

    return res.status(200).json({
      success: true,
      data: {
        member_id,
        checked_in_at: new Date().toISOString(),
        member_name: member?.name || `${member?.first_name} ${member?.last_name}`
      }
    });
  } catch (err) {
    console.error('Check-in error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
