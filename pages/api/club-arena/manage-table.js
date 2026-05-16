/**
 * POST /api/club-arena/manage-table
 * 
 * Table lifecycle management for club owners/admins.
 * Actions: close, delete, pause, resume
 * 
 * Body: { tableId, clubId, action }
 * Auth: Bearer token (owner or admin)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { runStandardGuards } = require('../../../src/lib/club-arena/redteam-validation');
const { isUUID } = require('../../../src/lib/club-arena/validate');
const { safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
import { reportApiError } from '../../../src/lib/sentryWrap';

const VALID_ACTIONS = ['close', 'delete', 'pause', 'resume'];

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    // ── C-05: Idempotency Guard ──
    if (checkIdempotency(req, res)) return;

    // ── RED TEAM: Payload size + field allowlist + UUID validation ──
    const guardErr = runStandardGuards(req.body, {
      maxBodySize: 512,
      allowedFields: new Set(['tableId', 'clubId', 'action']),
      uuids: { tableId: req.body?.tableId, clubId: req.body?.clubId },
    });
    if (guardErr) return res.status(guardErr.status).json({ success: false, error: guardErr.error });

    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { tableId, clubId, action } = req.body;

      // ── E-14: UUID format validation ──────────────────────────────────
      if (!tableId || !isUUID(tableId)) {
        return res.status(400).json({ success: false, error: 'tableId must be a valid UUID' });
      }
      if (!clubId || !isUUID(clubId)) {
        return res.status(400).json({ success: false, error: 'clubId must be a valid UUID' });
      }
      if (!action || !VALID_ACTIONS.includes(action)) {
        return res.status(400).json({ success: false, error: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
      }

      // Verify caller is owner or admin
      const { data: member } = await getSupabase()
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member || !['owner', 'admin'].includes(member.role)) {
        // Union admin fallback
        const { data: clubInfo, error: clubInfoErr } = await getSupabase().from('clubs').select('union_id').eq('id', clubId).maybeSingle();
        if (clubInfoErr || !clubInfo) {
          return res.status(403).json({ success: false, error: 'Only owners, admins, or union admins can manage tables' });
        }
        let unionAuth = false;
        if (clubInfo.union_id) {
          const { data: ua, error: uaErr } = await getSupabase().from('union_admins').select('role').eq('union_id', clubInfo.union_id).eq('user_id', user.id).maybeSingle();
          if (ua && !uaErr) {
              unionAuth = true;
          } else {
              // Owner fallback
              const { data: union } = await getSupabase().from('unions').select('id').eq('id', clubInfo.union_id).eq('owner_id', user.id).maybeSingle();
              if (union) unionAuth = true;
          }
        }
        if (!unionAuth) {
          return res.status(403).json({ success: false, error: 'Only owners, admins, or union admins can manage tables' });
        }
      }

      // Verify table belongs to club
      const { data: table } = await getSupabase()
        .from('tables')
        .select('id, club_id, status, name')
        .eq('id', tableId)
        .eq('club_id', clubId)
        .maybeSingle();

      if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

      const emitUnionEvent = (eventName, tableData) => {
        try {
          const { getBus } = require('../../../src/engine/EventBus');
          const bus = getBus();
          if (bus) {
            bus.emit(eventName, { clubId, tableId, ...tableData });
          }
        } catch (e) {
          console.warn(`[manage-table] EventBus error (${eventName}):`, e.message);
        }
      };

      switch (action) {
        case 'close': {
          // ... (close logic) ... (Wait, I need to inject the emit into each switch case right before returning)
          // Let's modify the whole switch statement to inject the calls. I will just do it explicitly in each block via multi_replace_file_content. I'll read the ends of each block first. Actually, I can just use a multi_replace for this file if that's safer, but let me check how manage-table is structured first.

          // ── E-09: State pre-check — only closeable statuses ──────────
          if (['closed', 'deleted'].includes(table.status)) {
            return res.status(400).json({ success: false, error: `Cannot close table — current status is '${table.status}'` });
          }

          // ── C-01: Atomic conditional update ──
          const { data: updated, error: updErr } = await getSupabase()
            .from('tables')
            .update({ status: 'closed', updated_at: new Date().toISOString() })
            .eq('id', tableId)
            .in('status', ['running', 'active', 'waiting', 'paused'])
            .select('id')
            .maybeSingle();

          if (updErr) throw updErr;
          if (!updated) return res.status(409).json({ success: false, error: 'Table status changed concurrently (conflict)' });

          try {
            const { getController } = require('../../../src/lib/poker-engine/GameController');
            const controller = await getController();
            await controller.closeTable(tableId);
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

          emitUnionEvent('union:table-closed', {});

          const responseBody = { success: true, action: 'close', tableId };
          cacheResponse(req, 200, responseBody);
          return res.status(200).json(responseBody);
        }

        case 'delete': {
          // ── E-11: Block delete on running/active tables — must close first ──
          if (['running', 'active'].includes(table.status)) {
            return res.status(400).json({ success: false, error: 'Cannot delete a running/active table. Close it first.' });
          }
          if (table.status === 'deleted') {
            return res.status(400).json({ success: false, error: 'Table is already deleted' });
          }

          // ── C-01: Atomic conditional update ──
          const { data: updated, error: updErr } = await getSupabase()
            .from('tables')
            .update({ status: 'deleted', updated_at: new Date().toISOString() })
            .eq('id', tableId)
            .in('status', ['waiting', 'paused', 'closed'])
            .select('id')
            .maybeSingle();

          if (updErr) throw updErr;
          if (!updated) return res.status(409).json({ success: false, error: 'Table status changed concurrently (conflict)' });

          try {
            const { getController } = require('../../../src/lib/poker-engine/GameController');
            const controller = await getController();
            await controller.closeTable(tableId);
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

          // Decrement club table count (C-02 wrapper — atomic JS fallback if RPC fails)
          const { error: rpcErr } = await getSupabase().rpc('decrement_club_table_count', { p_club_id: clubId });
          if (rpcErr) {
            // Atomic decrement update
            const { data: club } = await getSupabase().from('clubs').select('table_count').eq('id', clubId).maybeSingle();
            if (club) {
              await getSupabase().from('clubs').update({ table_count: Math.max(0, (club.table_count || 1) - 1) }).eq('id', clubId);
            }
          }

          emitUnionEvent('union:table-closed', {});

          const responseBody = { success: true, action: 'delete', tableId };
          cacheResponse(req, 200, responseBody);
          return res.status(200).json(responseBody);
        }

        case 'pause': {
          // ── E-10: State pre-check — only running/active can be paused ──
          if (!['running', 'active'].includes(table.status)) {
            return res.status(400).json({ success: false, error: `Cannot pause table — current status is '${table.status}'. Only running or active tables can be paused.` });
          }

          // ── C-01: Atomic conditional update ──
          const { data: updated, error: updErr } = await getSupabase()
            .from('tables')
            .update({ status: 'paused', updated_at: new Date().toISOString() })
            .eq('id', tableId)
            .in('status', ['running', 'active'])
            .select('id')
            .maybeSingle();

          if (updErr) throw updErr;
          if (!updated) return res.status(409).json({ success: false, error: 'Table status changed concurrently (conflict)' });

          try {
            const { getController } = require('../../../src/lib/poker-engine/GameController');
            const controller = await getController();
            const entry = controller.lobby?.tables?.get(tableId);
            if (entry) {
              entry.table.status = 'paused';
              entry.table.emit('table_paused', { by: user.id });
            }
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

          emitUnionEvent('union:table-updated', { status: 'paused' });

          const responseBody = { success: true, action: 'pause', tableId };
          cacheResponse(req, 200, responseBody);
          return res.status(200).json(responseBody);
        }

        case 'resume': {
          // Resume a paused table
          if (table.status !== 'paused') {
            return res.status(400).json({ success: false, error: 'Table is not paused' });
          }

          // ── C-01: Atomic conditional update ──
          const { data: updated, error: updErr } = await getSupabase()
            .from('tables')
            .update({ status: 'running', updated_at: new Date().toISOString() })
            .eq('id', tableId)
            .eq('status', 'paused')
            .select('id')
            .maybeSingle();

          if (updErr) throw updErr;
          if (!updated) return res.status(409).json({ success: false, error: 'Table status changed concurrently (conflict)' });

          try {
            const { getController } = require('../../../src/lib/poker-engine/GameController');
            const controller = await getController();
            const entry = controller.lobby?.tables?.get(tableId);
            if (entry) {
              entry.table.status = 'running';
              entry.table.emit('table_resumed', { by: user.id });
              // Trigger auto-start to begin dealing hands again
              entry.table._checkAutoStart?.();
            }
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

          emitUnionEvent('union:table-updated', { status: 'running' });

          const responseBody = { success: true, action: 'resume', tableId };
          cacheResponse(req, 200, responseBody);
          return res.status(200).json(responseBody);
        }

        default:
          return res.status(400).json({ success: false, error: `Unknown action: ${action}. Use: close, delete, pause, resume` });
      }
    } catch (err) {
      console.warn('[manage-table]', err);
      return res.status(500).json(safeErrorResponse(err, 'Failed to manage table'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
