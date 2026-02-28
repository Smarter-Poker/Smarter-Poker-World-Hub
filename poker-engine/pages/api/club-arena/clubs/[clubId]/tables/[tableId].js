/**
 * /api/club-arena/clubs/[clubId]/tables/[tableId] — Single table operations
 * 
 * GET    → Table state + engine state
 * DELETE → Close table (owner/agent only, cashes out all players)
 * PUT    → Pause/resume table
 */

import { createClient } from '@supabase/supabase-js';
import { getController } from '../../../../../src/GameController';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function getMembership(clubId, userId) {
  const { data } = await supabase
    .from('club_members')
    .select('id, role, chip_balance, status')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  return data;
}

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId, tableId } = req.query;
  const membership = await getMembership(clubId, user.id);
  if (!membership) return res.status(403).json({ error: 'Not a member' });

  const controller = await getController();

  if (req.method === 'GET') {
    const { data: table } = await supabase
      .from('club_tables')
      .select('*')
      .eq('id', tableId)
      .eq('club_id', clubId)
      .single();

    if (!table) return res.status(404).json({ error: 'Table not found' });

    // Get engine state
    const engineState = await controller.getTableState(tableId, user.id);

    return res.json({ table, engineState });
  }

  if (req.method === 'DELETE') {
    if (membership.role === 'player') {
      return res.status(403).json({ error: 'Only owners/agents can close tables' });
    }

    // Get all seated players from engine, cash them out
    const engineState = await controller.getTableState(tableId, null);
    if (engineState?.seats) {
      for (const seat of engineState.seats) {
        if (seat.player && seat.stack > 0) {
          // Find their membership
          const { data: memberData } = await supabase
            .from('club_members')
            .select('id')
            .eq('club_id', clubId)
            .eq('user_id', seat.player.id)
            .eq('status', 'active')
            .single();

          if (memberData) {
            try {
              await supabase.rpc('transfer_chips', {
                p_member_id: memberData.id,
                p_amount: seat.stack,
                p_type: 'cash_cashout',
                p_club_id: clubId,
                p_performed_by: user.id,
                p_table_id: tableId,
                p_note: 'Table closed by admin',
              });
            } catch (err) {
              console.error(`[table-close] Failed to cashout ${seat.player.id}:`, err);
            }
          }

          // Stand up in engine
          await controller.standUp(tableId, seat.player.id);
        }
      }
    }

    // Close in engine
    await controller.closeTable(tableId);

    // Update DB
    await supabase
      .from('club_tables')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', tableId);

    // Decrement club table count
    const { data: club } = await supabase
      .from('clubs')
      .select('table_count')
      .eq('id', clubId)
      .single();

    if (club) {
      await supabase
        .from('clubs')
        .update({ table_count: Math.max(0, (club.table_count || 1) - 1) })
        .eq('id', clubId);
    }

    return res.json({ success: true });
  }

  if (req.method === 'PUT') {
    if (membership.role === 'player') {
      return res.status(403).json({ error: 'Only owners/agents can manage tables' });
    }

    const { status } = req.body;
    if (!['active', 'paused', 'waiting'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await supabase
      .from('club_tables')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', tableId)
      .eq('club_id', clubId);

    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
