/**
 * POST /api/club-arena/manage-table
 * 
 * Table lifecycle management for club owners/admins.
 * Actions: close, delete, pause, resume
 * 
 * Body: { tableId, clubId, action }
 * Auth: Bearer token (owner or admin)
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { tableId, clubId, action } = req.body;
    if (!tableId || !clubId || !action) {
      return res.status(400).json({ success: false, error: 'tableId, clubId, and action required' });
    }

    // Verify caller is owner or admin
    const { data: member } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      // Union admin fallback
      const { data: clubInfo } = await supabaseAdmin.from('clubs').select('union_id').eq('id', clubId).single();
      let unionAuth = false;
      if (clubInfo?.union_id) {
        const { data: ua } = await supabaseAdmin.from('union_admins').select('role').eq('union_id', clubInfo.union_id).eq('user_id', user.id).single();
        unionAuth = !!ua;
      }
      if (!unionAuth) {
        return res.status(403).json({ success: false, error: 'Only owners, admins, or union admins can manage tables' });
      }
    }

    // Verify table belongs to club
    const { data: table } = await supabaseAdmin
      .from('tables')
      .select('id, club_id, status, name')
      .eq('id', tableId)
      .eq('club_id', clubId)
      .single();

    if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

    switch (action) {
      case 'close': {
        // Close table — stops game, kicks all players
        // 1. Update DB status
        await supabaseAdmin
          .from('tables')
          .update({ status: 'closed', updated_at: new Date().toISOString() })
          .eq('id', tableId);

        // 2. Close in engine if running
        try {
          const { getController } = require('../../../src/lib/poker-engine/GameController');
          const controller = await getController();
          await controller.closeTable(tableId);
        } catch (_) {
          // Engine not running or table not in engine
        }

        return res.status(200).json({ success: true, action: 'close', tableId });
      }

      case 'delete': {
        // Soft delete — marks as deleted, engine closes if running
        await supabaseAdmin
          .from('tables')
          .update({ status: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', tableId);

        try {
          const { getController } = require('../../../src/lib/poker-engine/GameController');
          const controller = await getController();
          await controller.closeTable(tableId);
        } catch (_) { /* intentionally silent */ }

        // Decrement club table count
        await supabaseAdmin.rpc('decrement_club_table_count', { p_club_id: clubId }).catch(() => {
          // RPC might not exist yet — fallback
          supabaseAdmin
            .from('clubs')
            .update({ table_count: Math.max(0, (table.table_count || 1) - 1) })
            .eq('id', clubId)
            .then(() => {});
        });

        return res.status(200).json({ success: true, action: 'delete', tableId });
      }

      case 'pause': {
        // Pause — finish current hand then stop dealing
        await supabaseAdmin
          .from('tables')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('id', tableId);

        try {
          const { getController } = require('../../../src/lib/poker-engine/GameController');
          const controller = await getController();
          const entry = controller.lobby?.tables?.get(tableId);
          if (entry) {
            entry.table.status = 'PAUSED';
            entry.table.emit('table_paused', { by: user.id });
          }
        } catch (_) { /* intentionally silent */ }

        return res.status(200).json({ success: true, action: 'pause', tableId });
      }

      case 'resume': {
        // Resume a paused table
        if (table.status !== 'paused') {
          return res.status(400).json({ success: false, error: 'Table is not paused' });
        }

        await supabaseAdmin
          .from('tables')
          .update({ status: 'running', updated_at: new Date().toISOString() })
          .eq('id', tableId);

        try {
          const { getController } = require('../../../src/lib/poker-engine/GameController');
          const controller = await getController();
          const entry = controller.lobby?.tables?.get(tableId);
          if (entry) {
            entry.table.status = 'RUNNING';
            entry.table.emit('table_resumed', { by: user.id });
          }
        } catch (_) { /* intentionally silent */ }

        return res.status(200).json({ success: true, action: 'resume', tableId });
      }

      default:
        return res.status(400).json({ success: false, error: `Unknown action: ${action}. Use: close, delete, pause, resume` });
    }
  } catch (err) {
    console.error('[manage-table]', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to manage table' });
  }
}
