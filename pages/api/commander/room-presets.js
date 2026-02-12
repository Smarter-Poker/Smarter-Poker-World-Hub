/**
 * Room Presets API
 * GET    /api/commander/room-presets - List presets for venue
 * POST   /api/commander/room-presets - Create new preset
 * PUT    /api/commander/room-presets?id=X - Update preset
 * DELETE /api/commander/room-presets?id=X - Delete preset
 * POST   /api/commander/room-presets?id=X&action=apply - Apply preset (opens tables)
 */
import { createClient } from '@supabase/supabase-js';
import { guardManager } from '../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardManager(req, res); if (!_g) return;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('venue_id, role, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    const venueId = staff.venue_id;

    // GET - List all presets
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('commander_room_presets')
        .select('*')
        .eq('venue_id', venueId)
        .order('name', { ascending: true });

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data: data || [] });
    }

    // POST - Create or Apply
    if (req.method === 'POST') {
      // Apply preset
      if (req.query.action === 'apply' && req.query.id) {
        const { data: preset, error: fetchErr } = await supabase
          .from('commander_room_presets')
          .select('*')
          .eq('id', req.query.id)
          .eq('venue_id', venueId)
          .single();

        if (fetchErr || !preset) {
          return res.status(404).json({ success: false, error: 'Preset not found' });
        }

        const tables = preset.tables || [];
        let gamesOpened = 0;

        // Get available tables
        const { data: availableTables } = await supabase
          .from('commander_tables')
          .select('id, table_number, status')
          .eq('venue_id', venueId)
          .eq('status', 'available')
          .order('table_number', { ascending: true });

        let tableIdx = 0;
        for (const config of tables) {
          for (let i = 0; i < (config.count || 1); i++) {
            if (tableIdx >= (availableTables || []).length) break;
            const table = availableTables[tableIdx];
            tableIdx++;

            // Open a game on this table
            await supabase.from('commander_games').insert({
              venue_id: venueId,
              table_id: table.id,
              game_type: config.short_code || config.game_type_name || 'NLH',
              stakes: config.stakes,
              min_buyin: config.min_buyin || 100,
              max_buyin: config.max_buyin || 0,
              max_players: config.max_players || 9,
              status: 'waiting',
              started_at: new Date().toISOString()
            });

            // Mark table as in use
            await supabase.from('commander_tables')
              .update({ status: 'in_use' })
              .eq('id', table.id);

            gamesOpened++;
          }
        }

        // Update last_applied_at
        await supabase.from('commander_room_presets')
          .update({ last_applied_at: new Date().toISOString() })
          .eq('id', preset.id);

        // Log it
        await supabase.from('commander_system_log').insert({
          venue_id: venueId,
          action: 'preset_applied',
          details: { preset_id: preset.id, preset_name: preset.name, games_opened: gamesOpened },
          performed_by: user.id,
          performed_by_name: staff.name
        });

        return res.status(200).json({
          success: true,
          data: { games_opened: gamesOpened, preset_name: preset.name }
        });
      }

      // Create new preset
      if (!['owner', 'manager'].includes(staff.role)) {
        return res.status(403).json({ success: false, error: 'Manager access required' });
      }

      const { name, description, tables: tableConfigs, is_default, auto_apply_schedule } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Preset name required' });

      const { data, error } = await supabase
        .from('commander_room_presets')
        .insert({
          venue_id: venueId,
          name,
          description: description || null,
          tables: tableConfigs || [],
          is_default: is_default || false,
          auto_apply_schedule: auto_apply_schedule || null,
          created_by: user.id
        })
        .select()
        .single();

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(201).json({ success: true, data });
    }

    // PUT - Update preset
    if (req.method === 'PUT') {
      if (!['owner', 'manager'].includes(staff.role)) {
        return res.status(403).json({ success: false, error: 'Manager access required' });
      }

      const id = req.query.id;
      if (!id) return res.status(400).json({ success: false, error: 'Preset ID required' });

      const updates = {};
      const allowed = ['name', 'description', 'tables', 'is_default', 'auto_apply_schedule'];
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('commander_room_presets')
        .update(updates)
        .eq('id', id)
        .eq('venue_id', venueId)
        .select()
        .single();

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data });
    }

    // DELETE
    if (req.method === 'DELETE') {
      if (!['owner', 'manager'].includes(staff.role)) {
        return res.status(403).json({ success: false, error: 'Manager access required' });
      }

      const id = req.query.id;
      if (!id) return res.status(400).json({ success: false, error: 'Preset ID required' });

      const { error } = await supabase
        .from('commander_room_presets')
        .delete()
        .eq('id', id)
        .eq('venue_id', venueId);

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Room presets API error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
