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

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { tableId, clubId, name, smallBlind, bigBlind, maxPlayers,
            minBuyIn, maxBuyIn, ante, actionTime, settings } = req.body;

    if (!tableId || !clubId) {
      return res.status(400).json({ error: 'tableId and clubId required' });
    }

    // Verify caller is owner or admin
    const { data: member } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only owners and admins can update table settings' });
    }

    // Verify table belongs to club
    const { data: table, error: tableErr } = await supabaseAdmin
      .from('tables')
      .select('id, club_id, settings')
      .eq('id', tableId)
      .eq('club_id', clubId)
      .single();

    if (tableErr || !table) {
      return res.status(404).json({ error: 'Table not found in this club' });
    }

    // Build update object
    const updates = { updated_at: new Date().toISOString() };

    if (name !== undefined) updates.name = name.trim().slice(0, 100);
    if (smallBlind !== undefined) updates.small_blind = Math.max(0.01, parseFloat(smallBlind));
    if (bigBlind !== undefined) updates.big_blind = Math.max(0.02, parseFloat(bigBlind));
    if (maxPlayers !== undefined) updates.max_players = Math.min(Math.max(parseInt(maxPlayers), 2), 10);
    if (minBuyIn !== undefined) updates.min_buy_in = Math.max(1, parseFloat(minBuyIn));
    if (maxBuyIn !== undefined) updates.max_buy_in = Math.max(1, parseFloat(maxBuyIn));
    if (ante !== undefined) updates.ante = Math.max(0, parseFloat(ante));
    if (actionTime !== undefined) updates.action_time_seconds = Math.min(Math.max(parseInt(actionTime), 10), 120);

    // Merge settings (preserve existing settings, override with new values)
    if (settings && typeof settings === 'object') {
      const existingSettings = table.settings || {};
      updates.settings = { ...existingSettings, ...settings };
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('tables')
      .update(updates)
      .eq('id', tableId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // If the engine has this table running, signal a config reload
    // The engine will pick up new settings on next hand start
    try {
      const { getController } = require('../../../../src/lib/poker-engine/GameController');
      const controller = await getController();
      const entry = controller.lobby?.tables?.get(tableId);
      if (entry) {
        // Update live config (takes effect next hand)
        if (updates.settings) {
          entry.config.clubSettings = { ...entry.config.clubSettings, ...updates.settings };
        }
        if (updates.small_blind) entry.config.smallBlind = updates.small_blind;
        if (updates.big_blind) entry.config.bigBlind = updates.big_blind;
        if (updates.max_players) entry.config.maxSeats = updates.max_players;
        if (updates.action_time_seconds) entry.config.actionTime = updates.action_time_seconds;

        // Broadcast config update to clients
        entry.table.emit('config_updated', {
          settings: updates.settings || {},
          stakes: updates.small_blind || updates.big_blind
            ? `${updates.small_blind || entry.config.smallBlind}/${updates.big_blind || entry.config.bigBlind}`
            : undefined,
        });
      }
    } catch (_) {
      // Engine not running — settings will apply on next connect
    }

    return res.status(200).json({ success: true, table: updated });
  } catch (err) {
    console.error('[update-table-settings]', err);
    return res.status(500).json({ error: err.message || 'Failed to update table settings' });
  }
}
