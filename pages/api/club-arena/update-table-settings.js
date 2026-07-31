import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * POST /api/club-arena/update-table-settings
 * 
 * Update an existing table's settings (name, stakes, game options, security).
 * Only club owner/admin can update. Changes propagate to running engine.
 * 
 * Body: { tableId, clubId, name?, smallBlind?, bigBlind?, maxPlayers?,
 *         minBuyIn?, maxBuyIn?, ante?, actionTime?, settings? }
 * 
 * Auth: Bearer token (owner or admin)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const { isUUID } = require('../../../src/lib/club-arena/validate');
const { sanitizeTableName, clampFloat, sanitizeSettings, safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');

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

    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { tableId, clubId, name, smallBlind, bigBlind, maxPlayers,
        minBuyIn, maxBuyIn, ante, actionTime, settings } = req.body;

      // ── E-14: UUID format validation ──────────────────────────────────
      if (!tableId || !isUUID(tableId)) {
        return res.status(400).json({ success: false, error: 'tableId must be a valid UUID' });
      }
      if (!clubId || !isUUID(clubId)) {
        return res.status(400).json({ success: false, error: 'clubId must be a valid UUID' });
      }

      // Verify caller is owner or admin
      const { data: member } = await getSupabase()
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ success: false, error: 'Only owners and admins can update table settings' });
      }

      // Verify table belongs to club
      const { data: table, error: tableErr } = await getSupabase()
        .from('tables')
        .select('id, club_id, settings')
        .eq('id', tableId)
        .eq('club_id', clubId)
        .maybeSingle();

      if (tableErr || !table) {
        return res.status(404).json({ success: false, error: 'Table not found in this club' });
      }

      // Build update object — E-05: NaN-safe numeric parsing
      const updates = { updated_at: new Date().toISOString() };

      // ── E-01: XSS-safe name sanitization ─────────────────────────────
      if (name !== undefined) updates.name = sanitizeTableName(name, 100);

      // ── E-05: Reject NaN from parseFloat — return 400 ──────────────────
      if (smallBlind !== undefined) {
        const r = clampFloat(smallBlind, 0.01, 100000);
        if (!r.valid) return res.status(400).json({ success: false, error: `smallBlind: ${r.error}` });
        updates.small_blind = r.value;
      }
      if (bigBlind !== undefined) {
        const r = clampFloat(bigBlind, 0.02, 200000);
        if (!r.valid) return res.status(400).json({ success: false, error: `bigBlind: ${r.error}` });
        updates.big_blind = r.value;
      }
      if (maxPlayers !== undefined) {
        const r = clampFloat(maxPlayers, 2, 10);
        if (!r.valid) return res.status(400).json({ success: false, error: `maxPlayers: ${r.error}` });
        updates.max_players = Math.round(r.value);
      }
      if (minBuyIn !== undefined) {
        const r = clampFloat(minBuyIn, 1, 10_000_000);
        if (!r.valid) return res.status(400).json({ success: false, error: `minBuyIn: ${r.error}` });
        updates.min_buy_in = r.value;
      }
      if (maxBuyIn !== undefined) {
        const r = clampFloat(maxBuyIn, 1, 10_000_000);
        if (!r.valid) return res.status(400).json({ success: false, error: `maxBuyIn: ${r.error}` });
        updates.max_buy_in = r.value;
      }
      if (ante !== undefined) {
        const r = clampFloat(ante, 0, 1000);
        if (!r.valid) return res.status(400).json({ success: false, error: `ante: ${r.error}` });
        updates.ante = r.value;
      }
      if (actionTime !== undefined) {
        const r = clampFloat(actionTime, 10, 120);
        if (!r.valid) return res.status(400).json({ success: false, error: `actionTime: ${r.error}` });
        updates.action_time_seconds = Math.round(r.value);
      }

      // ── E-07: Cross-field validation — ensure min < max ─────────────────
      const finalMinBuyIn = updates.min_buy_in ?? table.min_buy_in;
      const finalMaxBuyIn = updates.max_buy_in ?? table.max_buy_in;
      if (finalMinBuyIn && finalMaxBuyIn && finalMinBuyIn > finalMaxBuyIn) {
        return res.status(400).json({ success: false, error: 'minBuyIn cannot exceed maxBuyIn' });
      }
      const finalSB = updates.small_blind ?? table.small_blind;
      const finalBB = updates.big_blind ?? table.big_blind;
      if (finalSB && finalBB && finalBB <= finalSB) {
        return res.status(400).json({ success: false, error: 'bigBlind must be greater than smallBlind' });
      }

      // ── E-06: Whitelist settings keys before merge ───────────────────
      if (settings && typeof settings === 'object') {
        const existingSettings = table.settings || {};
        const cleanSettings = sanitizeSettings(settings);
        updates.settings = { ...existingSettings, ...cleanSettings };
      }

      const { data: updated, error: updateErr } = await getSupabase()
        .from('tables')
        .update(updates)
        .eq('id', tableId)
        .select()
        .maybeSingle();

      if (updateErr) throw updateErr;

      // If the engine has this table running, signal a config reload
      // The engine will pick up new settings on next hand start
      try {
        const { getController } = require('../../../src/lib/poker-engine/GameController');
        const controller = await getController();
        const entry = controller.lobby?.tables?.get(tableId);
        if (entry) {
          // Update live config (takes effect next hand)
          if (updates.settings) {
            entry.config.clubSettings = { ...entry.config.clubSettings, ...updates.settings };
          }
          if (updates.small_blind) {
            entry.config.smallBlind = updates.small_blind;
            entry.table.smallBlind = updates.small_blind;
            entry.table.game.config.smallBlind = updates.small_blind;
          }
          if (updates.big_blind) {
            entry.config.bigBlind = updates.big_blind;
            entry.table.bigBlind = updates.big_blind;
            entry.table.game.config.bigBlind = updates.big_blind;
          }
          if (updates.max_players) {
            entry.config.maxSeats = updates.max_players;
            entry.table.maxSeats = updates.max_players;
          }
          if (updates.min_buy_in) {
            entry.config.minBuyIn = updates.min_buy_in;
            entry.table.minBuyIn = updates.min_buy_in;
          }
          if (updates.max_buy_in) {
            entry.config.maxBuyIn = updates.max_buy_in;
            entry.table.maxBuyIn = updates.max_buy_in;
          }
          if (updates.ante !== undefined) {
            entry.config.ante = updates.ante;
            entry.table.game.config.ante = updates.ante;
          }
          if (updates.action_time_seconds) {
            entry.config.actionTime = updates.action_time_seconds;
            if (entry.timer) entry.timer.turnTime = updates.action_time_seconds;
          }
          if (updates.name) {
            entry.table.tableName = updates.name;
          }

          // Broadcast config update to clients
          entry.table.emit('config_updated', {
            settings: updates.settings || {},
            stakes: updates.small_blind || updates.big_blind
              ? `${updates.small_blind || entry.config.smallBlind}/${updates.big_blind || entry.config.bigBlind}`
              : undefined,
          });
        }
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

      try {
          const { getBus } = require('../../../src/engine/EventBus');
          const bus = getBus();
          if (bus) {
              bus.emit('union:table-updated', {
                  clubId,
                  tableId: updated.id,
                  status: updated.status,
                  name: updated.name,
                  smallBlind: updated.small_blind,
                  bigBlind: updated.big_blind
              });
          }
      } catch (e) {
          console.warn('[update-table-settings] EventBus error:', e.message);
      }

      const responseBody = { success: true, table: updated };
      cacheResponse(req, 200, responseBody);
      return res.status(200).json(responseBody);
    } catch (err) {
      console.warn('[update-table-settings]', err);
      return res.status(500).json({ success: false, error: 'Failed to update table settings' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
