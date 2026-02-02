/**
 * Single Award API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * PUT /api/commander/promotions/[id]/awards/[awardId] - Update award (approve/pay/void)
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id: promotionId, awardId } = req.query;

  if (!promotionId || !awardId) {
    return res.status(400).json({ error: 'Promotion ID and Award ID required' });
  }

  if (req.method === 'PUT') {
    return updateAward(req, res, promotionId, awardId);
  }

  res.setHeader('Allow', ['PUT']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function updateAward(req, res, promotionId, awardId) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get award
    const { data: award } = await supabase
      .from('commander_promotion_awards')
      .select('id, venue_id, status')
      .eq('id', awardId)
      .eq('promotion_id', promotionId)
      .single();

    if (!award) {
      return res.status(404).json({ error: 'Award not found' });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', award.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'You are not authorized to update awards' });
    }

    const { action, notes } = req.body;

    if (!action || !['approve', 'pay', 'void'].includes(action)) {
      return res.status(400).json({ error: 'Valid action required: approve, pay, or void' });
    }

    const updates = { metadata: { updated_by: user.id } };

    if (action === 'approve') {
      if (award.status !== 'pending') {
        return res.status(400).json({ error: 'Can only approve pending awards' });
      }
      updates.status = 'approved';
      updates.approved_by = staff.id;
      updates.approved_at = new Date().toISOString();
    } else if (action === 'pay') {
      if (award.status !== 'approved') {
        return res.status(400).json({ error: 'Can only pay approved awards' });
      }
      updates.status = 'paid';
      updates.paid_at = new Date().toISOString();
    } else if (action === 'void') {
      updates.status = 'void';
    }

    if (notes) {
      updates.notes = notes;
    }

    const { data: updatedAward, error } = await supabase
      .from('commander_promotion_awards')
      .update(updates)
      .eq('id', awardId)
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url),
        commander_staff:approved_by (id, display_name)
      `)
      .single();

    if (error) throw error;

    return res.status(200).json({
      award: updatedAward,
      message: `Award ${action}${action === 'pay' ? 'id' : action === 'void' ? 'ed' : 'd'}`
    });
  } catch (error) {
    console.error('Update award error:', error);
    return res.status(500).json({ error: error.message });
  }
}
