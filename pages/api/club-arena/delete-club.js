/**
 * POST /api/club-arena/delete-club
 * 
 * Permanently deletes a club and all related data.
 * Cascade deletes in FK-safe order.
 * 
 * Body: { clubId, confirmName }
 * Auth: Bearer token (must be club owner)
 */
import { createClient } from '@supabase/supabase-js';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId, confirmName } = req.body;
  if (!clubId || !confirmName) {
    return res.status(400).json({ error: 'clubId and confirmName required' });
  }

  // Rate limit
  if (!applyRateLimit(req, res, 'club-arena/delete-club')) return;

  try {
    // 1. Verify club exists and caller is owner
    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id, name, owner_id')
      .eq('id', clubId)
      .single();

    if (!club) return res.status(404).json({ error: 'Club not found' });
    if (club.owner_id !== user.id) {
      return res.status(403).json({ error: 'Only the club owner can delete the club' });
    }

    // 2. Confirm name matches
    if (confirmName !== club.name) {
      return res.status(400).json({ error: 'Club name does not match' });
    }

    // 3. Cascade delete in FK-safe order
    const tables = [
      'chip_transactions',
      'cashout_requests',
      'commission_records',
      'commission_history',
      'rake_records',
      'settlement_periods',
      'club_announcements',
      'club_activity',
      'club_shop_purchases',
      'club_shop_items',
      'hand_history',
      'tables',
      'union_clubs',
      'agents',
      'club_transactions',
    ];

    for (const table of tables) {
      // Rate limit
  if (!applyRateLimit(req, res, 'club-arena/delete-club')) return;

  try {
        await supabaseAdmin.from(table).delete().eq('club_id', clubId);
      } catch (e) {
        // Table may not exist or have no matching rows — continue
      }
    }

    // 4. Delete members
    await supabaseAdmin.from('club_members').delete().eq('club_id', clubId);

    // 5. Delete club
    const { error: deleteErr } = await supabaseAdmin.from('clubs').delete().eq('id', clubId);
    if (deleteErr) throw deleteErr;

    return res.status(200).json({
      success: true,
      message: `Club "${club.name}" has been permanently deleted`,
    });
  } catch (err) {
    console.error('[delete-club]', err);
    return res.status(500).json({ error: 'Club deletion failed', details: err.message });
  }
}
