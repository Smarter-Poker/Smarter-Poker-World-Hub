/**
 * Floor View API
 * GET /api/commander/tournaments/[id]/floor-view
 * Returns complete tournament state for the TD Tablet:
 * - Tournament info + clock state
 * - All tables with player counts and balance status
 * - All seated players with chip counts
 * - Imbalance alerts
 * - Stats (entries, rebuys, addons, prize pool, avg stack)
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id: tournamentId } = req.query;
  if (!tournamentId) return res.status(400).json({ success: false, error: 'Tournament ID required' });

  try {
    // Staff is already validated by guardWriteStaff at the handler level

    // Get tournament with full details
    const { data: tournament, error: tErr } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();
    if (tErr || !tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });


    // Get ALL entries (active + eliminated + registered)
    const { data: allEntries } = await supabase
      .from('commander_tournament_entries')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('table_number', { ascending: true })
      .order('seat_number', { ascending: true });

    const entries = allEntries || [];
    const activeEntries = entries.filter(e => ['active', 'seated'].includes(e.status));
    const eliminatedEntries = entries.filter(e => e.status === 'eliminated');
    const registeredEntries = entries.filter(e => e.status === 'registered');

    // Build table map
    const tableNumbers = [...new Set(activeEntries.map(e => e.table_number).filter(Boolean))].sort((a, b) => a - b);
    const maxSeats = 9; // default

    const tableCounts = {};
    tableNumbers.forEach(tn => { tableCounts[tn] = 0; });
    activeEntries.forEach(e => {
      if (e.table_number) tableCounts[e.table_number] = (tableCounts[e.table_number] || 0) + 1;
    });

    const countValues = Object.values(tableCounts);
    const maxCount = countValues.length > 0 ? Math.max(...countValues) : 0;
    const minCount = countValues.length > 0 ? Math.min(...countValues) : 0;

    const tables = tableNumbers.map(tn => {
      const players = activeEntries
        .filter(e => e.table_number === tn)
        .map(e => ({
          entry_id: e.id,
          player_name: e.player_name,
          seat_number: e.seat_number,
          current_chips: e.current_chips,
          rebuy_count: e.rebuy_count || 0,
          addon_taken: e.addon_taken || false,
          locked: e.metadata?.locked_seat || false
        }));

      const count = tableCounts[tn];
      let color = 'green';
      if (count === 0) color = 'grey';
      else if (maxCount - count >= 2) color = 'red';
      else if (maxCount - count === 1) color = 'yellow';
      if (tournament.status === 'final_table') color = 'blue';

      return {
        table_number: tn,
        player_count: count,
        max_seats: maxSeats,
        available_seats: maxSeats - count,
        color,
        players
      };
    });

    // Calculate stats
    const totalRebuys = entries.reduce((sum, e) => sum + (e.rebuy_count || 0), 0);
    const totalAddons = entries.filter(e => e.addon_taken).length;
    const totalChips = activeEntries.reduce((sum, e) => sum + (e.current_chips || 0), 0);
    const avgStack = activeEntries.length > 0 ? Math.round(totalChips / activeEntries.length) : 0;
    const prizePool = tournament.actual_prizepool || tournament.prize_pool ||
      (entries.length * (tournament.buyin_amount || 0)) +
      (totalRebuys * (tournament.rebuy_cost || 0)) +
      (totalAddons * (tournament.addon_cost || 0));

    // Check late registration
    const lateRegOpen = tournament.status === 'running' &&
      (tournament.current_level || 0) <= (tournament.late_registration_levels || 0);

    // Imbalance check
    const imbalanced = tableNumbers.length >= 2 && (maxCount - minCount >= 2);
    const canBreakTable = tableNumbers.length > Math.ceil(activeEntries.length / maxSeats);

    // Clock info
    const blindStructure = tournament.blind_structure || [];
    const currentLevel = tournament.current_level || 0;
    const currentBlinds = blindStructure[currentLevel] || {};
    const nextBlinds = blindStructure[currentLevel + 1] || null;

    // Compute remaining_seconds dynamically (mirrors clock.js logic)
    let remaining_seconds = 0;
    let clockState = tournament.clock_state || null;

    // Auto-initialize clock_state for running tournaments that were never properly started
    if (!clockState && ['running', 'break', 'final_table'].includes(tournament.status)) {
      clockState = {
        isRunning: tournament.status === 'running',
        levelStartedAt: tournament.actual_start || tournament.scheduled_start || new Date().toISOString(),
        pausedAt: null,
        pausedDuration: 0
      };
      // Persist so this only happens once
      await supabase
        .from('commander_tournaments')
        .update({ clock_state: clockState, actual_start: clockState.levelStartedAt })
        .eq('id', tournamentId);
    }

    if (currentBlinds && currentBlinds.duration && clockState && clockState.levelStartedAt) {
      const levelDuration = currentBlinds.duration * 60 * 1000;
      const elapsed = clockState.isRunning
        ? Date.now() - new Date(clockState.levelStartedAt).getTime() - (clockState.pausedDuration || 0)
        : clockState.pausedAt
          ? new Date(clockState.pausedAt).getTime() - new Date(clockState.levelStartedAt).getTime() - (clockState.pausedDuration || 0)
          : 0;
      remaining_seconds = Math.max(0, Math.floor((levelDuration - elapsed) / 1000));
    }

    return res.status(200).json({
      success: true,
      data: {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          status: tournament.status,
          tournament_type: tournament.tournament_type,
          buyin_amount: tournament.buyin_amount,
          buyin_fee: tournament.buyin_fee,
          starting_chips: tournament.starting_chips,
          allows_rebuys: tournament.allows_rebuys,
          rebuy_cost: tournament.rebuy_cost,
          rebuy_chips: tournament.rebuy_chips,
          rebuy_levels: tournament.rebuy_levels,
          allows_addon: tournament.allows_addon,
          addon_cost: tournament.addon_cost,
          addon_chips: tournament.addon_chips,
          late_registration_levels: tournament.late_registration_levels,
          guaranteed_pool: tournament.guaranteed_pool,
          started_at: tournament.actual_start || tournament.started_at,
          actual_start: tournament.actual_start,
          scheduled_start: tournament.scheduled_start,
          game_type: tournament.game_type,
          payout_structure: tournament.payout_structure,
          custom_payouts: tournament.custom_payouts,
          clock_color: tournament.settings?.clock_color,
        },
        clock: {
          current_level: currentLevel,
          current_blinds: currentBlinds,
          next_blinds: nextBlinds,
          clock_state: {
            ...(tournament.clock_state || {}),
            remaining_seconds,
            status: clockState?.isRunning ? 'running' : 'paused',
            started_at: tournament.actual_start,
          },
          total_levels: blindStructure.length
        },
        stats: {
          total_entries: entries.length,
          players_remaining: activeEntries.length,
          players_eliminated: eliminatedEntries.length,
          players_registered: registeredEntries.length,
          total_rebuys: totalRebuys,
          total_addons: totalAddons,
          prize_pool: prizePool,
          total_chips: totalChips,
          average_stack: avgStack,
          tables_active: tableNumbers.length,
          late_reg_open: lateRegOpen,
          levels_until_late_reg_closes: lateRegOpen
            ? (tournament.late_registration_levels || 0) - currentLevel
            : 0
        },
        alerts: {
          imbalanced,
          can_break_table: canBreakTable,
          hand_for_hand: tournament.clock_state?.hand_for_hand || false,
          on_break: tournament.clock_state?.on_break || false
        },
        tables,
        eliminated: eliminatedEntries
          .sort((a, b) => (b.finish_position || 999) - (a.finish_position || 999))
          .slice(0, 20)
          .map(e => ({
            entry_id: e.id,
            player_name: e.player_name,
            finish_position: e.finish_position,
            eliminated_at: e.eliminated_at,
            payout_amount: e.payout_amount
          }))
      }
    });
  } catch (err) {
    console.error('Floor view error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
