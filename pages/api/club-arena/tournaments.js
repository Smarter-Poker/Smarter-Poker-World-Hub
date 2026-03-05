/**
 * POST /api/club-arena/tournaments
 *   action: 'create' | 'list' | 'register' | 'unregister' | 'start' | 'cancel'
 * 
 * Full tournament lifecycle management for Club Arena.
 */

import { createClient } from '@supabase/supabase-js';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { action, ...params } = req.body;

    // Settlement lock — block chip-moving actions during settlement window
    const chipActions = ['register', 'unregister', 'cancel'];
    if (chipActions.includes(action) && params.clubId) {
      const lockCheck = await checkSettlementLock(supabaseAdmin, params.clubId);
      if (lockCheck.locked) return sendLockedResponse(res, lockCheck);
    }

    switch (action) {
      // ═══════════════════════════════════════════════════════
      // CREATE TOURNAMENT
      // ═══════════════════════════════════════════════════════
      case 'create': {
        const {
          clubId, name, type = 'mtt', variant = 'nlh',
          buy_in, buyIn, starting_chips, startingChips: startChips,
          max_players, maxPlayers: maxP,
          blindStructure, lateRegLevels = 6,
          rebuyEnabled = false, rebuyLevels = 4, rebuyCost,
          addonEnabled = false, addonCost, addonChips,
          guaranteedPrize = 0, scheduledStart,
          sngSize = 6, // for SNG
          settings = {}, // comprehensive settings from CreateTournamentModal
        } = params;

        const resolvedBuyIn = parseFloat(buy_in || buyIn || 100);
        const resolvedStartingChips = parseInt(starting_chips || startChips || 10000);
        const resolvedMaxPlayers = parseInt(max_players || maxP || 100);

        if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

        // Verify user is admin/owner of this club
        const { data: member } = await supabaseAdmin
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .single();

        if (!member || !['owner', 'admin', 'manager'].includes(member.role)) {
          return res.status(403).json({ success: false, error: 'Only club admins can create tournaments' });
        }

        // ── Blind structure generation based on speed ──
        const speed = settings?.blind_structure || 'standard';
        const durationMultiplier = speed === 'slow' ? 2 : speed === 'turbo' ? 0.5 : speed === 'hyper_turbo' ? 0.25 : 1;
        const defaultBlinds = [
          { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, duration: Math.round(15 * durationMultiplier) },
          { level: 2, smallBlind: 50, bigBlind: 100, ante: 0, duration: Math.round(15 * durationMultiplier) },
          { level: 3, smallBlind: 75, bigBlind: 150, ante: 25, duration: Math.round(15 * durationMultiplier) },
          { level: 4, smallBlind: 100, bigBlind: 200, ante: 25, duration: Math.round(15 * durationMultiplier) },
          { level: 5, smallBlind: 150, bigBlind: 300, ante: 50, duration: Math.round(12 * durationMultiplier) },
          { level: 6, smallBlind: 200, bigBlind: 400, ante: 50, duration: Math.round(12 * durationMultiplier) },
          { level: 0, smallBlind: 0, bigBlind: 0, ante: 0, duration: settings?.add_on_break_length || 5, isBreak: true },
          { level: 7, smallBlind: 300, bigBlind: 600, ante: 75, duration: Math.round(12 * durationMultiplier) },
          { level: 8, smallBlind: 400, bigBlind: 800, ante: 100, duration: Math.round(10 * durationMultiplier) },
          { level: 9, smallBlind: 500, bigBlind: 1000, ante: 125, duration: Math.round(10 * durationMultiplier) },
          { level: 10, smallBlind: 750, bigBlind: 1500, ante: 200, duration: Math.round(10 * durationMultiplier) },
          { level: 11, smallBlind: 1000, bigBlind: 2000, ante: 250, duration: Math.round(10 * durationMultiplier) },
          { level: 12, smallBlind: 1500, bigBlind: 3000, ante: 400, duration: Math.round(8 * durationMultiplier) },
          { level: 13, smallBlind: 2000, bigBlind: 4000, ante: 500, duration: Math.round(8 * durationMultiplier) },
          { level: 14, smallBlind: 3000, bigBlind: 6000, ante: 750, duration: Math.round(8 * durationMultiplier) },
          { level: 15, smallBlind: 5000, bigBlind: 10000, ante: 1000, duration: Math.round(8 * durationMultiplier) },
        ];

        // Override blinds up if provided
        if (settings?.blinds_up_minutes) {
          defaultBlinds.forEach(b => { if (!b.isBreak) b.duration = settings.blinds_up_minutes; });
        }

        const { data: tournament, error: createErr } = await supabaseAdmin
          .from('club_tournaments')
          .insert({
            club_id: clubId,
            created_by: user.id,
            name: (name || `${variant.toUpperCase()} ${type.toUpperCase()}`).slice(0, 100),
            type,
            variant,
            buy_in: resolvedBuyIn,
            starting_chips: resolvedStartingChips,
            max_players: type === 'sng' ? (settings?.table_size || sngSize) : resolvedMaxPlayers,
            blind_structure: blindStructure || defaultBlinds,
            late_reg_levels: type === 'mtt' ? parseInt(settings?.late_registration_level || lateRegLevels) : 0,
            rebuy_enabled: settings?.custom_rebuy_cost || rebuyEnabled,
            rebuy_levels: (settings?.custom_rebuy_cost || rebuyEnabled) ? parseInt(settings?.number_of_rebuys || rebuyLevels) : 0,
            rebuy_cost: (settings?.custom_rebuy_cost || rebuyEnabled) ? parseFloat(rebuyCost || resolvedBuyIn) : 0,
            addon_enabled: settings?.custom_add_on || addonEnabled,
            addon_cost: (settings?.custom_add_on || addonEnabled) ? parseFloat(addonCost || resolvedBuyIn) : 0,
            addon_chips: (settings?.custom_add_on || addonEnabled) ? parseInt(addonChips || resolvedStartingChips * (settings?.add_on_multiplier || 1)) : 0,
            guaranteed_prize: settings?.gtd_amount || parseFloat(guaranteedPrize),
            scheduled_start: settings?.start_time || scheduledStart || null,
            status: type === 'mtt' ? 'scheduled' : 'registering',
            registered_count: 0,
            prize_pool: 0,
            settings: {
              // ── SNG size ──
              sngSize: type === 'sng' ? (settings?.table_size || sngSize) : null,
              // ── General (Images 7-9) ──
              vip_only: settings?.vip_only || false,
              private_game: settings?.private_game || false,
              satellite: settings?.satellite || false,
              accelerated_mtt: settings?.accelerated_mtt || false,
              ban_chat: settings?.ban_chat || false,
              all_in_or_fold: settings?.all_in_or_fold || false,
              label_new: settings?.label_new || false,
              table_size: settings?.table_size || 9,
              action_time: settings?.action_time || 15,
              fee_percent: settings?.fee_percent || 10,
              custom_buy_in: settings?.custom_buy_in || false,
              // ── Auto (SNG) ──
              auto_restart: settings?.auto_restart || false,
              auto_create_table: settings?.auto_create_table || false,
              // ── Structure (Image 8, 11) ──
              blind_structure_speed: settings?.blind_structure || 'standard',
              payout_structure: settings?.payout_structure || 'standard',
              // ── Rebuy/Add-on (Image 10) ──
              custom_rebuy_cost: settings?.custom_rebuy_cost || false,
              number_of_rebuys: settings?.number_of_rebuys || 3,
              add_on_multiplier: settings?.add_on_multiplier || 1.0,
              custom_add_on: settings?.custom_add_on || false,
              add_on_break_length: settings?.add_on_break_length || 1,
              // ── Special MTT Modes (Image 11) ──
              ko_bounty: settings?.ko_bounty || false,
              gtd_prize_pool: settings?.gtd_prize_pool || false,
              gtd_amount: settings?.gtd_amount || 0,
              final_table_deal: settings?.final_table_deal || false,
              big_blind_ante: settings?.big_blind_ante || false,
              authorized_to_register: settings?.authorized_to_register || false,
              short_description: settings?.short_description || '',
              // ── Registration (Image 12) ──
              late_registration_level: settings?.late_registration_level || 6,
              early_bird_registration: settings?.early_bird_registration || false,
              bubble_protection: settings?.bubble_protection || false,
              featured_tournament: settings?.featured_tournament || false,
              min_players: settings?.min_players || (type === 'sng' ? 2 : 30),
              max_players: settings?.max_players || (type === 'sng' ? 10 : 300),
              // ── Schedule (Image 12) ──
              multi_day_mtt: settings?.multi_day_mtt || false,
              save_start_time: settings?.save_start_time || false,
              start_time: settings?.start_time || null,
              restart_tournament: settings?.restart_tournament || false,
              tournament_schedule: settings?.tournament_schedule || false,
              synchronized_breaks: settings?.synchronized_breaks !== false,
              // ── Security ──
              restrict_device: settings?.restrict_device !== false,
              restrict_observers: settings?.restrict_observers || false,
              gps_restriction: settings?.gps_restriction !== false,
              ip_restriction: settings?.ip_restriction !== false,
              emulator_restriction: settings?.emulator_restriction || false,
              photo_rotation_verification: settings?.photo_rotation_verification || false,
              hide_club_name: settings?.hide_club_name || false,
            },
          })
          .select()
          .single();

        if (createErr) {
          console.error('[tournament/create]', createErr);
          return res.status(500).json({ success: false, error: createErr.message });
        }

        return res.json({ success: true, tournament });
      }

      // ═══════════════════════════════════════════════════════
      // LIST TOURNAMENTS
      // ═══════════════════════════════════════════════════════
      case 'list': {
        const { clubId, status } = params;
        if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

        let query = supabaseAdmin
          .from('club_tournaments')
          .select('*')
          .eq('club_id', clubId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (status) {
          if (Array.isArray(status)) {
            query = query.in('status', status);
          } else {
            query = query.eq('status', status);
          }
        }

        const { data: tournaments, error: listErr } = await query;
        if (listErr) return res.status(500).json({ success: false, error: listErr.message });

        return res.json({ success: true, tournaments: tournaments || [] });
      }

      // ═══════════════════════════════════════════════════════
      // REGISTER FOR TOURNAMENT
      // ═══════════════════════════════════════════════════════
      case 'register': {
        const { tournamentId } = params;
        if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

        // Get tournament
        const { data: tourn } = await supabaseAdmin
          .from('club_tournaments')
          .select('*')
          .eq('id', tournamentId)
          .single();

        if (!tourn) return res.status(404).json({ success: false, error: 'Tournament not found' });
        if (!['scheduled', 'registering'].includes(tourn.status)) {
          return res.status(400).json({ success: false, error: 'Registration not open' });
        }
        if (tourn.registered_count >= tourn.max_players) {
          return res.status(400).json({ success: false, error: 'Tournament full' });
        }

        // Check player has enough chips
        const { data: member } = await supabaseAdmin
          .from('club_members')
          .select('chip_balance')
          .eq('club_id', tourn.club_id)
          .eq('user_id', user.id)
          .single();

        if (!member) return res.status(400).json({ success: false, error: 'Not a member of this club' });
        if ((member.chip_balance || 0) < tourn.buy_in) {
          return res.status(400).json({ success: false, error: 'Insufficient chips', balance: member.chip_balance, required: tourn.buy_in });
        }

        // Check not already registered
        const { data: existing } = await supabaseAdmin
          .from('tournament_registrations')
          .select('id')
          .eq('tournament_id', tournamentId)
          .eq('user_id', user.id)
          .eq('status', 'registered')
          .single();

        if (existing) return res.status(400).json({ success: false, error: 'Already registered' });

        // Deduct buy-in (atomic — uses FOR UPDATE row lock to prevent race conditions)
        const { data: lockResult, error: lockErr } = await supabaseAdmin.rpc('lock_chips_for_table', {
          p_user_id: user.id,
          p_club_id: tourn.club_id,
          p_table_id: tournamentId, // Use tournament ID as "table" for audit trail
          p_amount: tourn.buy_in,
        });

        if (lockErr || !lockResult?.success) {
          return res.status(400).json({ success: false, error: lockResult?.error || lockErr?.message || 'Failed to deduct buy-in' });
        }

        // Register
        const { error: regErr } = await supabaseAdmin
          .from('tournament_registrations')
          .insert({
            tournament_id: tournamentId,
            user_id: user.id,
            club_id: tourn.club_id,
            buy_in_amount: tourn.buy_in,
            status: 'registered',
          });

        if (regErr) {
          // Rollback chip deduction via atomic RPC
          await supabaseAdmin.rpc('unlock_chips_from_table', {
            p_user_id: user.id,
            p_club_id: tourn.club_id,
            p_table_id: tournamentId,
            p_amount: tourn.buy_in,
          });
          return res.status(500).json({ success: false, error: regErr.message });
        }

        // Update count + prize pool (optimistic lock prevents concurrent over-admission)
        const { data: countUpd } = await supabaseAdmin
          .from('club_tournaments')
          .update({
            registered_count: tourn.registered_count + 1,
            prize_pool: (tourn.prize_pool || 0) + tourn.buy_in,
          })
          .eq('id', tournamentId)
          .eq('registered_count', tourn.registered_count) // fails if concurrent registration changed it
          .select('registered_count');

        if (!countUpd?.length) {
          // Race detected — count was changed by concurrent request.
          // Registration itself succeeded (DB row inserted), so just re-read fresh values.
          const { data: freshData } = await supabaseAdmin
            .from('club_tournaments')
            .select('registered_count, prize_pool')
            .eq('id', tournamentId)
            .single();
          // Retry the increment with fresh values
          await supabaseAdmin
            .from('club_tournaments')
            .update({
              registered_count: (freshData?.registered_count || 0) + 1,
              prize_pool: (freshData?.prize_pool || 0) + tourn.buy_in,
            })
            .eq('id', tournamentId);
        }

        // Re-read count for SNG auto-start check (authoritative)
        const { data: freshTourn } = await supabaseAdmin
          .from('club_tournaments')
          .select('registered_count')
          .eq('id', tournamentId)
          .single();
        const currentCount = freshTourn?.registered_count || tourn.registered_count + 1;

        // Auto-start SNG when full — init engine THEN mark running
        if (tourn.type === 'sng' && currentCount >= tourn.max_players) {
          try {
            const { getController } = require('../../../src/lib/poker-engine/GameController');
            const controller = await getController();

            const { data: sngRegs } = await supabaseAdmin
              .from('tournament_registrations')
              .select('user_id, display_name')
              .eq('tournament_id', tournamentId)
              .eq('status', 'registered')
                  .limit(100);

            const sngCreate = await controller.createTournament({
              tournamentId,
              tournamentType: 'sng',
              name: tourn.name,
              variant: tourn.variant || 'holdem',
              startingChips: tourn.starting_chips || 5000,
              buyinAmount: tourn.buy_in || 100,
              maxEntries: tourn.max_players || 9,
              clubId: tourn.club_id,
            });

            if (sngCreate.success) {
              for (const reg of (sngRegs || [])) {
                await controller.registerForTournament(tournamentId, reg.user_id, reg.display_name || 'Player', { chipsAlreadyLocked: true });
              }
              await controller.startTournament(tournamentId);
              await supabaseAdmin
                .from('club_tournaments')
                .update({ status: 'running', started_at: new Date().toISOString() })
                .eq('id', tournamentId);
            } else {
              console.error('[Tournament] SNG engine create failed:', sngCreate.error);
            }
          } catch (sngErr) {
            console.error('[Tournament] SNG auto-start engine error:', sngErr.message);
            // Don't mark running — stays in registering until manually started
          }
        }

        return res.json({ success: true, registeredCount: currentCount });
      }

      // ═══════════════════════════════════════════════════════
      // UNREGISTER
      // ═══════════════════════════════════════════════════════
      case 'unregister': {
        const { tournamentId } = params;
        if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

        const { data: reg } = await supabaseAdmin
          .from('tournament_registrations')
          .select('*, club_tournaments(*)')
          .eq('tournament_id', tournamentId)
          .eq('user_id', user.id)
          .eq('status', 'registered')
          .single();

        if (!reg) return res.status(400).json({ success: false, error: 'Not registered' });

        const tourn = reg.club_tournaments;
        if (tourn.status === 'running') {
          return res.status(400).json({ success: false, error: 'Cannot unregister from running tournament' });
        }

        // Refund by unlocking chips (registration used lock_chips_for_table)
        await supabaseAdmin.rpc('unlock_chips_from_table', {
          p_user_id: user.id,
          p_club_id: tourn.club_id,
          p_table_id: tournamentId,
          p_amount: reg.buy_in_amount,
        });

        // Update registration
        await supabaseAdmin
          .from('tournament_registrations')
          .update({ status: 'unregistered' })
          .eq('id', reg.id);

        // Update count
        await supabaseAdmin
          .from('club_tournaments')
          .update({
            registered_count: Math.max(0, tourn.registered_count - 1),
            prize_pool: Math.max(0, (tourn.prize_pool || 0) - reg.buy_in_amount),
          })
          .eq('id', tournamentId);

        return res.json({ success: true });
      }

      // ═══════════════════════════════════════════════════════
      // START TOURNAMENT (admin only)
      // ═══════════════════════════════════════════════════════
      case 'start': {
        const { tournamentId } = params;
        if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

        const { data: tourn } = await supabaseAdmin
          .from('club_tournaments')
          .select('*')
          .eq('id', tournamentId)
          .single();

        if (!tourn) return res.status(404).json({ success: false, error: 'Tournament not found' });

        // Verify admin
        const { data: member } = await supabaseAdmin
          .from('club_members')
          .select('role')
          .eq('club_id', tourn.club_id)
          .eq('user_id', user.id)
          .single();

        if (!member || !['owner', 'admin', 'manager'].includes(member.role)) {
          return res.status(403).json({ success: false, error: 'Admin only' });
        }

        if (tourn.registered_count < 2) {
          return res.status(400).json({ success: false, error: 'Need at least 2 players' });
        }

        // Initialize engine tournament via GameController FIRST, then mark running
        try {
          const { getController } = require('../../../src/lib/poker-engine/GameController');
          const controller = await getController();

          // Get registered players
          const { data: registrations } = await supabaseAdmin
            .from('tournament_registrations')
            .select('user_id, display_name')
            .eq('tournament_id', tournamentId)
            .eq('status', 'registered')
                .limit(100);

          // Create tournament in engine
          const createResult = await controller.createTournament({
            tournamentId,
            tournamentType: tourn.type || 'mtt',
            name: tourn.name,
            variant: tourn.variant || 'holdem',
            startingChips: tourn.starting_chips || 10000,
            buyinAmount: tourn.buy_in || 100,
            maxEntries: tourn.max_players || 100,
            lateRegLevels: tourn.settings?.lateRegLevels || 6,
            allowsRebuys: tourn.settings?.rebuyEnabled || false,
            allowsAddon: tourn.settings?.addonEnabled || false,
            clubId: tourn.club_id,
            clubIds: tourn.settings?.clubIds || [tourn.club_id],
          });

          if (!createResult.success) {
            console.error('[Tournament] Engine create failed:', createResult.error);
            return res.status(500).json({ success: false, error: 'Engine failed to create tournament: ' + (createResult.error || 'unknown') });
          }

          // Register all players in engine (chips already locked at registration time)
          for (const reg of (registrations || [])) {
            await controller.registerForTournament(tournamentId, reg.user_id, reg.display_name || 'Player', { chipsAlreadyLocked: true });
          }

          // Start the engine tournament
          await controller.startTournament(tournamentId);

          // Engine started successfully — NOW mark running in DB
          await supabaseAdmin
            .from('club_tournaments')
            .update({ status: 'running', started_at: new Date().toISOString() })
            .eq('id', tournamentId);

        } catch (engineErr) {
          console.error('[Tournament] Engine init error:', engineErr.message);
          // Engine failed — do NOT mark as running, revert to registering
          await supabaseAdmin
            .from('club_tournaments')
            .update({ status: 'registering' })
            .eq('id', tournamentId);
          return res.status(500).json({ success: false, error: 'Engine failed to start tournament. Please try again.' });
        }

        return res.json({ success: true });
      }

      // ═══════════════════════════════════════════════════════
      // CANCEL TOURNAMENT (admin only)
      // ═══════════════════════════════════════════════════════
      case 'cancel': {
        const { tournamentId } = params;
        if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

        const { data: tourn } = await supabaseAdmin
          .from('club_tournaments')
          .select('*')
          .eq('id', tournamentId)
          .single();

        if (!tourn) return res.status(404).json({ success: false, error: 'Tournament not found' });
        if (tourn.status === 'running') {
          return res.status(400).json({ success: false, error: 'Cannot cancel running tournament' });
        }

        // Verify admin
        const { data: cancelMember } = await supabaseAdmin
          .from('club_members')
          .select('role')
          .eq('club_id', tourn.club_id)
          .eq('user_id', user.id)
          .single();

        if (!cancelMember || !['owner', 'admin', 'manager'].includes(cancelMember.role)) {
          return res.status(403).json({ success: false, error: 'Only club admins can cancel tournaments' });
        }

        // Refund all registered players
        const { data: registrations } = await supabaseAdmin
          .from('tournament_registrations')
          .select('*')
          .eq('tournament_id', tournamentId)
          .eq('status', 'registered');

        for (const reg of (registrations || [])) {
          // Refund by releasing the chip lock (registration used lock_chips_for_table)
          await supabaseAdmin.rpc('unlock_chips_from_table', {
            p_user_id: reg.user_id,
            p_club_id: tourn.club_id,
            p_table_id: tournamentId,
            p_amount: reg.buy_in_amount,
          });

          await supabaseAdmin.from('tournament_registrations')
            .update({ status: 'refunded' })
            .eq('id', reg.id);
        }

        await supabaseAdmin
          .from('club_tournaments')
          .update({ status: 'cancelled' })
          .eq('id', tournamentId);

        return res.json({ success: true, refunded: (registrations || []).length });
      }

      default:
        return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[club-arena/tournaments]', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}
