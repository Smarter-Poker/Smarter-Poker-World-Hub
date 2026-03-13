/**
 * POST /api/cron/scheduled-table-opener
 * 
 * Called by Vercel Cron every 5 minutes.
 * Checks table_templates with schedule_enabled=true, and if
 * current time matches schedule_days + schedule_time, creates the table.
 * 
 * Auth: ADMIN_ROUTE_SECRET or CRON_SECRET
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    // Auth: cron secret
    const secret = req.headers['x-cron-secret'] || req.headers.authorization?.replace('Bearer ', '');
    const validSecret = process.env.ADMIN_ROUTE_SECRET || process.env.CRON_SECRET;
    if (!validSecret || secret !== validSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Get all enabled schedules where next_scheduled_at is in the past (or null)
      const now = new Date();
      const { data: templates, error } = await supabaseAdmin
        .from('table_templates')
        .select('*, clubs(id, name, club_id, status)')
        .eq('schedule_enabled', true)
        .or(`next_scheduled_at.is.null,next_scheduled_at.lte.${now.toISOString()}`);

      if (error) throw error;
      if (!templates || templates.length === 0) {
        return res.json({ success: true, message: 'No scheduled tables due', opened: 0 });
      }

      let opened = 0;
      const errors = [];

      for (const tmpl of templates) {
        try {
          // Skip if club is not active
          if (tmpl.clubs?.status !== 'active') continue;

          // Check if today matches schedule_days
          const tz = tmpl.schedule_timezone || 'America/Chicago';
          const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
          const dayOfWeek = localNow.getDay(); // 0=Sun

          if (!tmpl.schedule_days?.includes(dayOfWeek)) {
            // Not scheduled for today — compute next_scheduled_at and skip
            await _updateNextScheduled(tmpl);
            continue;
          }

          // Check if current time matches schedule_time (±6 min window for 5-min cron)
          if (tmpl.schedule_time) {
            const [schedH, schedM] = tmpl.schedule_time.split(':').map(Number);
            const localH = localNow.getHours();
            const localM = localNow.getMinutes();
            const schedMins = schedH * 60 + schedM;
            const nowMins = localH * 60 + localM;
            if (Math.abs(nowMins - schedMins) > 6) {
              continue; // Not time yet
            }
          }

          // Check if already opened recently (prevent duplicate within 30 min)
          if (tmpl.last_scheduled_at) {
            const lastOpened = new Date(tmpl.last_scheduled_at);
            if (now - lastOpened < 30 * 60 * 1000) continue;
          }

          // Check if a table with this template's name is already running
          const { data: existingTable } = await supabaseAdmin
            .from('tables')
            .select('id')
            .eq('club_id', tmpl.club_id)
            .eq('name', tmpl.name)
            .in('status', ['active', 'running', 'waiting'])
            .maybeSingle();

          if (existingTable) continue; // Already open

          // Create the table
          const settings = tmpl.settings || {};
          const { data: newTable, error: createErr } = await supabaseAdmin
            .from('tables')
            .insert({
              club_id: tmpl.club_id,
              name: tmpl.name,
              game_type: tmpl.game_type || 'cash',
              game_variant: tmpl.game_variant || 'nlh',
              small_blind: tmpl.small_blind || 1,
              big_blind: tmpl.big_blind || 2,
              ante: tmpl.ante || 0,
              min_buy_in: tmpl.min_buy_in || 40,
              max_buy_in: tmpl.max_buy_in || 200,
              max_players: tmpl.max_players || 9,
              action_time_seconds: tmpl.action_time_seconds || 30,
              status: 'waiting',
              current_players: 0,
              settings,
              created_by: tmpl.created_by,
            })
            .select('id')
            .maybeSingle();

          if (createErr) throw createErr;

          // Update template metadata
          await supabaseAdmin
            .from('table_templates')
            .update({
              last_scheduled_at: now.toISOString(),
              use_count: (tmpl.use_count || 0) + 1,
            })
            .eq('id', tmpl.id);

          await _updateNextScheduled(tmpl);

          opened++;
          console.log(`[scheduled-table-opener] Opened "${tmpl.name}" in club ${tmpl.clubs?.name || tmpl.club_id}`);
        } catch (e) {
          errors.push({ template: tmpl.name, error: e.message });
          console.error(`[scheduled-table-opener] Error for "${tmpl.name}":`, e.message);
        }
      }

      return res.json({ success: true, opened, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
      console.error('[scheduled-table-opener] Fatal:', err);
      return res.status(500).json({ error: 'Cron failed' });
    }

    // Compute next_scheduled_at for a template
    async function _updateNextScheduled(tmpl) {
      if (!tmpl.schedule_days?.length || !tmpl.schedule_time) return;
      try {
        const tz = tmpl.schedule_timezone || 'America/Chicago';
        const [h, m] = tmpl.schedule_time.split(':').map(Number);
        const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));

        // Find next matching day
        for (let offset = 1; offset <= 7; offset++) {
          const candidate = new Date(localNow);
          candidate.setDate(candidate.getDate() + offset);
          candidate.setHours(h, m, 0, 0);
          if (tmpl.schedule_days.includes(candidate.getDay())) {
            await supabaseAdmin
              .from('table_templates')
              .update({ next_scheduled_at: candidate.toISOString() })
              .eq('id', tmpl.id);
            return;
          }
        }
      } catch (_) { /* non-fatal */ }
    }

  } catch (err) {
    console.error('[API Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
