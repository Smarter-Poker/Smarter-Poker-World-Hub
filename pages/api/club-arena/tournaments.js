/**
 * POST /api/club-arena/tournaments
 *   action: 'create' | 'list' | 'register' | 'unregister' | 'start' | 'cancel'
 * 
 * Full tournament lifecycle management for Club Arena.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
import { notifyUser, notifyClubMembers } from '../../../src/lib/club-arena/notify';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { runStandardGuards, validateUUID, sanitizeInt, sanitizeFloat } = require('../../../src/lib/club-arena/redteam-validation');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const crypto = require('crypto');
import { reportApiError } from '../../../src/lib/sentryWrap';

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
  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    // ── RED TEAM: Payload size limit (4KB — create action has large settings) ──
    const guardErr = runStandardGuards(req.body, { maxBodySize: 4096 });
    if (guardErr) return res.status(guardErr.status).json({ success: false, error: guardErr.error });

    // CONCURRENCY: Idempotency guard — dedup rapid double-taps
    if (checkIdempotency(req, res)) return;

    if (!applyRateLimit(req, res, 'club-arena/tournaments')) return;

    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Not authenticated' });

      const { action, ...params } = req.body;

      // ── RED TEAM: Validate action is a known string ──
      const VALID_ACTIONS = ['create', 'list', 'register', 'unregister', 'start', 'cancel'];
      if (!action || typeof action !== 'string' || !VALID_ACTIONS.includes(action)) {
        return res.status(400).json({ success: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` });
      }

      // ── RED TEAM: UUID validation on clubId/tournamentId (per action) ──
      if (params.clubId) {
        const clubErr = validateUUID(params.clubId, 'clubId');
        if (clubErr) return res.status(400).json({ success: false, error: clubErr });
      }
      if (params.tournamentId) {
        const tournErr = validateUUID(params.tournamentId, 'tournamentId');
        if (tournErr) return res.status(400).json({ success: false, error: tournErr });
      }

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
          const { data: member } = await getSupabase()
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!member || !['owner', 'admin', 'super_agent'].includes(member.role)) {
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

          const { data: tournament, error: createErr } = await getSupabase()
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
                // ── Bounty System ──
                bounty_type: settings?.bounty_type || 'none',
                bounty_amount: parseFloat(settings?.bounty_amount || 0),
                bounty_percent: parseFloat(settings?.bounty_percent || 0),
                mystery_threshold: parseInt(settings?.mystery_threshold || 0),
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
            .maybeSingle();

          if (createErr || !tournament) {
            console.warn('[tournament/create]', createErr);
            return res.status(500).json({ success: false, error: 'Failed to create tournament' });
          }

          return res.json({ success: true, tournament });
        }

        // ═══════════════════════════════════════════════════════
        // LIST TOURNAMENTS
        // ═══════════════════════════════════════════════════════
        case 'list': {
          const { clubId, status } = params;
          if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

          let query = getSupabase()
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
          if (listErr) return res.status(500).json({ success: false, error: 'Failed to load tournaments' });

          return res.json({ success: true, tournaments: tournaments || [] });
        }

        // ═══════════════════════════════════════════════════════
        // REGISTER FOR TOURNAMENT
        // ═══════════════════════════════════════════════════════
        // Mandate 1 [ORB-3]: Atomic registration via advisory lock.
        // All validation, chip deduction, registration insert, and
        // counter increment happen inside a single Postgres transaction
        // serialized by pg_advisory_xact_lock(hashtext(tournament_id)).
        // ═══════════════════════════════════════════════════════
        case 'register': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

          // Get tournament (for SNG auto-start + notification metadata)
          const { data: tourn } = await getSupabase()
            .from('club_tournaments')
            .select('*')
            .eq('id', tournamentId)
            .maybeSingle();

          if (!tourn) return res.status(404).json({ success: false, error: 'Tournament not found' });

          // ── Atomic registration: single RPC with advisory lock ──
          const { data: regResult, error: regErr } = await getSupabase().rpc('fn_tournament_atomic_register', {
            p_user_id: user.id,
            p_club_id: tourn.club_id,
            p_tournament_id: tournamentId,
            p_buy_in: tourn.buy_in,
          });

          if (regErr) {
            console.warn('[tournament/register] RPC error:', regErr.message);
            return res.status(500).json({ success: false, error: 'Registration failed' });
          }
          if (!regResult?.success) {
            // Map specific errors to appropriate HTTP status codes
            const errMsg = regResult?.error || 'Registration failed';
            const statusCode = ['Tournament not found'].includes(errMsg) ? 404
              : ['Registration not open', 'Tournament full', 'Already registered', 'Insufficient chips', 'Not a member of this club'].includes(errMsg) ? 400
                : 500;
            return res.status(statusCode).json({
              success: false,
              error: errMsg,
              ...(regResult?.balance !== undefined && { balance: regResult.balance }),
              ...(regResult?.required !== undefined && { required: regResult.required }),
            });
          }

          const currentCount = regResult.registered_count;

          // Auto-start SNG when full — init engine THEN mark running
          if (tourn.type === 'sng' && currentCount >= tourn.max_players) {
            try {
              const { getController } = require('../../../src/lib/poker-engine/GameController');
              const controller = await getController();

              const { data: sngRegs } = await getSupabase()
                .from('tournament_registrations')
                .select('user_id, display_name')
                .eq('tournament_id', tournamentId)
                .eq('status', 'registered')
                .limit(100);

              const feePercent = tourn.settings?.fee_percent || 10;
              const buyinFee = Math.round(tourn.buy_in * feePercent / 100);

              const sngCreate = await controller.createTournament({
                tournamentId,
                tournamentType: 'sng',
                name: tourn.name,
                variant: tourn.variant || 'holdem',
                startingChips: tourn.starting_chips || 5000,
                buyinAmount: tourn.buy_in || 100,
                buyinFee,
                maxEntries: tourn.max_players || 9,
                clubId: tourn.club_id,
                // ── Bounty System ──
                bountyType: tourn.settings?.bounty_type || 'none',
                bountyAmount: parseFloat(tourn.settings?.bounty_amount || 0),
              });

              if (sngCreate.success) {
                for (const reg of (sngRegs || [])) {
                  await controller.registerForTournament(tournamentId, reg.user_id, reg.display_name || 'Player', { chipsAlreadyLocked: true });
                }
                await controller.startTournament(tournamentId);
                const { error: err_club_tournaments_113jc } = await getSupabase()
                  .from('club_tournaments')
                  .update({ status: 'running', started_at: new Date().toISOString() })
                  .eq('id', tournamentId);
                if (err_club_tournaments_113jc) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_113jc.message);
              } else {
                console.warn('[Tournament] SNG engine create failed:', sngCreate.error);
              }
            } catch (sngErr) {
              console.warn('[Tournament] SNG auto-start engine error:', sngErr.message);
              // Don't mark running — stays in registering until manually started
            }
          }

          // ── BUG-9 FIX: Late Registration Sync ──
          // If the tournament is already running, sync the registrant to the engine immediately.
          if (tourn.status === 'running') {
            try {
              const { getController } = require('../../../src/lib/poker-engine/GameController');
              const controller = await getController();

              // Get the display name saved during fn_tournament_atomic_register
              const { data: regInfo } = await getSupabase()
                .from('tournament_registrations')
                .select('display_name')
                .eq('tournament_id', tournamentId)
                .eq('user_id', user.id)
                .maybeSingle();

              // Register and physically seat the player into the live engine.
              // chipsAlreadyLocked ensures the engine doesn't double-charge them.
              const engineReg = await controller.registerForTournament(
                tournamentId,
                user.id,
                regInfo?.display_name || 'Player',
                { chipsAlreadyLocked: true }
              );

              if (!engineReg.success) {
                console.warn(`[Tournament] Engine late-reg failed for ${user.id}:`, engineReg.error);
              } else {
                console.info(`[Tournament] Engine late-reg succeeded.`);
              }
            } catch (err) {
              console.warn('[Tournament] Engine late-reg exception:', err.message);
            }
          }

          // Notify registrant
          await notifyUser(supabaseAdmin, {
            userId: user.id, type: 'tournament_registered',
            title: `🏆 Registered: ${tourn.name}`,
            message: `You're registered for ${tourn.name}. ${currentCount}/${tourn.max_players} players.`,
            data: { tournamentId, clubId: tourn.club_id, tournamentName: tourn.name },
            pushUrl: `/hub/club-arena/tournaments?club=${tourn.club_id}`,
          }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

          return res.json({ success: true, registeredCount: currentCount });
        }

        // ═══════════════════════════════════════════════════════
        // UNREGISTER
        // ═══════════════════════════════════════════════════════
        case 'unregister': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

          const { data: reg } = await getSupabase()
            .from('tournament_registrations')
            .select('*, club_tournaments(*)')
            .eq('tournament_id', tournamentId)
            .eq('user_id', user.id)
            .eq('status', 'registered')
            .maybeSingle();

          if (!reg) return res.status(400).json({ success: false, error: 'Not registered' });

          const tourn = reg.club_tournaments;
          if (tourn.status === 'running') {
            return res.status(400).json({ success: false, error: 'Cannot unregister from running tournament' });
          }

          // Refund by unlocking chips (registration used lock_chips_for_table).
          // CRITICAL: capture the error. Previously the call ignored the RPC
          // result — if unlock_chips_from_table failed, the registration was
          // STILL marked 'unregistered' below and the counter decremented,
          // leaving the player permanently short their buy-in with no record
          // they ever paid it.
          const { error: unlockErr } = await getSupabase().rpc('unlock_chips_from_table', {
            p_user_id: user.id,
            p_club_id: tourn.club_id,
            p_table_id: tournamentId,
            p_amount: reg.buy_in_amount,
          });
          if (unlockErr) {
            console.warn('[tournaments/unregister] unlock_chips_from_table failed (refund NOT issued):', unlockErr?.message || unlockErr);
            return res.status(500).json({ success: false, error: 'Refund failed — please retry' });
          }

          // Update registration
          const { error: regUpdErr } = await getSupabase()
            .from('tournament_registrations')
            .update({ status: 'unregistered' })
            .eq('id', reg.id);
          if (regUpdErr) {
            console.warn('[tournaments/unregister] registration status update failed (refund already issued):', regUpdErr?.message || regUpdErr);
            // Do NOT re-debit — chips were unlocked. Player can re-register
            // and the unique constraint will catch the dupe.
          }

          // Update count atomically (cosmetic — counter only)
          const { error: ctrErr } = await getSupabase().rpc('fn_tournament_unregister_counter', {
            p_tournament_id: tournamentId,
            p_buy_in: reg.buy_in_amount,
          });
          if (ctrErr) {
            console.warn('[tournaments/unregister] counter update failed (non-fatal):', ctrErr?.message || ctrErr);
          }

          return res.json({ success: true });
        }

        // ═══════════════════════════════════════════════════════
        // START TOURNAMENT (admin only)
        // ═══════════════════════════════════════════════════════
        case 'start': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

          const { data: tourn } = await getSupabase()
            .from('club_tournaments')
            .select('*')
            .eq('id', tournamentId)
            .maybeSingle();

          if (!tourn) return res.status(404).json({ success: false, error: 'Tournament not found' });

          // Verify admin
          const { data: member } = await getSupabase()
            .from('club_members')
            .select('role')
            .eq('club_id', tourn.club_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!member || !['owner', 'admin', 'super_agent'].includes(member.role)) {
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
            const { data: registrations } = await getSupabase()
              .from('tournament_registrations')
              .select('user_id, display_name')
              .eq('tournament_id', tournamentId)
              .eq('status', 'registered')
              .limit(100);

            const mttFeePercent = tourn.settings?.fee_percent || 10;
            const mttBuyinFee = Math.round((tourn.buy_in || 100) * mttFeePercent / 100);

            // Create tournament in engine
            const createResult = await controller.createTournament({
              tournamentId,
              tournamentType: tourn.type || 'mtt',
              name: tourn.name,
              variant: tourn.variant || 'holdem',
              startingChips: tourn.starting_chips || 10000,
              buyinAmount: tourn.buy_in || 100,
              buyinFee: mttBuyinFee,
              maxEntries: tourn.max_players || 100,
              lateRegLevels: tourn.settings?.lateRegLevels || 6,
              allowsRebuys: tourn.settings?.rebuyEnabled || false,
              allowsAddon: tourn.settings?.addonEnabled || false,
              clubId: tourn.club_id,
              clubIds: tourn.settings?.clubIds || [tourn.club_id],
              // ── Bounty System ──
              bountyType: tourn.settings?.bounty_type || 'none',
              bountyAmount: parseFloat(tourn.settings?.bounty_amount || 0),
              mysteryThreshold: tourn.settings?.mystery_threshold
                ? Math.ceil(tourn.settings.mystery_threshold / 100 * tourn.registered_count)
                : 0,
            });

            if (!createResult.success) {
              console.warn('[Tournament] Engine create failed:', createResult.error);
              return res.status(500).json({ success: false, error: 'Engine failed to create tournament: ' + (createResult.error || 'unknown') });
            }

            // Register all players in engine (chips already locked at registration time)
            for (const reg of (registrations || [])) {
              await controller.registerForTournament(tournamentId, reg.user_id, reg.display_name || 'Player', { chipsAlreadyLocked: true });
            }

            // Start the engine tournament
            await controller.startTournament(tournamentId);

            // ═══════════════════════════════════════════════════════
            // GTD OVERLAY MATH [Improvement #4]
            // ═══════════════════════════════════════════════════════
            const gtdAmount = parseFloat(tourn.settings?.gtd_amount || tourn.guaranteed_prize || 0);
            const totalBuyins = (tourn.buy_in || 0) * tourn.registered_count;
            let overlayAmount = 0;
            let finalPrizePool = totalBuyins;

            if (gtdAmount > 0 && totalBuyins < gtdAmount) {
                overlayAmount = gtdAmount - totalBuyins;
                finalPrizePool = gtdAmount;
                console.info(`[Tournament] GTD Overlay detected for ${tournamentId}: $${overlayAmount} (GTD: $${gtdAmount}, Buyins: $${totalBuyins})`);
                // Note: Future enhancement could deduct `overlayAmount` from club's treasury here.
            }

            // Engine started successfully — NOW mark running in DB, and store prize pool/overlay
            const { error: err_club_tournaments_kne2f } = await getSupabase()
              .from('club_tournaments')
              .update({ 
                 status: 'running', 
                 started_at: new Date().toISOString(),
                 prize_pool: finalPrizePool,
                 settings: { ...(tourn.settings || {}), overlay_amount: overlayAmount }
              })
              .eq('id', tournamentId);
            if (err_club_tournaments_kne2f) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_kne2f.message);

          } catch (engineErr) {
            console.warn('[Tournament] Engine init error:', engineErr.message);
            // Engine failed — do NOT mark as running, revert to registering
            const { error: err_club_tournaments_yya5r } = await getSupabase()
              .from('club_tournaments')
              .update({ status: 'registering' })
              .eq('id', tournamentId);
            if (err_club_tournaments_yya5r) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_yya5r.message);
            return res.status(500).json({ success: false, error: 'Engine failed to start tournament. Please try again.' });
          }

          // Notify all club members that tournament started
          await notifyClubMembers(supabaseAdmin, {
            clubId: tourn.club_id, type: 'tournament_started',
            title: `🏆 Tournament Starting: ${tourn.name}`,
            message: `${tourn.name} is now live with ${tourn.registered_count} players!`,
            data: { tournamentId, tournamentName: tourn.name },
            pushUrl: `/hub/club-arena/tournaments?club=${tourn.club_id}`,
          }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

          return res.json({ success: true });
        }

        // ═══════════════════════════════════════════════════════
        // CANCEL TOURNAMENT (admin only)
        // ═══════════════════════════════════════════════════════
        // Mandate 3 [ORB-3]: Safety Wire — batch-refund MUST complete
        // before tournament status is set to 'cancelled'. If any
        // refund fails, the status remains unchanged and the admin
        // receives a diagnostic response for manual remediation.
        // ═══════════════════════════════════════════════════════
        case 'cancel': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

          const { data: tourn } = await getSupabase()
            .from('club_tournaments')
            .select('*')
            .eq('id', tournamentId)
            .maybeSingle();

          if (!tourn) return res.status(404).json({ success: false, error: 'Tournament not found' });
          if (tourn.status === 'running') {
            return res.status(400).json({ success: false, error: 'Cannot cancel running tournament' });
          }

          // Verify admin
          const { data: cancelMember } = await getSupabase()
            .from('club_members')
            .select('role')
            .eq('club_id', tourn.club_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!cancelMember || !['owner', 'admin', 'super_agent'].includes(cancelMember.role)) {
            return res.status(403).json({ success: false, error: 'Only club admins can cancel tournaments' });
          }

          // Fetch all registered players for batch refund
          const { data: registrations, error: regErr } = await getSupabase()
            .from('tournament_registrations')
            .select('*')
            .eq('tournament_id', tournamentId)
            .eq('status', 'registered');

          if (regErr) {
            console.warn('[Tournament] Failed to fetch registrations for refund:', regErr);
            return res.status(500).json({ success: false, error: 'Failed to fetch registrations for refund' });
          }

          // ── Batch refund with verification ──
          const refundResults = [];
          const failedRefunds = [];

          for (const reg of (registrations || [])) {
            try {
              // Step A: Refund chips (release the lock)
              const { data: refundResult, error: refundErr } = await getSupabase().rpc('unlock_chips_from_table', {
                p_user_id: reg.user_id,
                p_club_id: tourn.club_id,
                p_table_id: tournamentId,
                p_amount: reg.buy_in_amount,
              });

              if (refundErr) throw new Error(refundErr.message);

              // Step B: Mark registration as refunded
              const { error: updateErr } = await getSupabase().from('tournament_registrations')
                .update({ status: 'refunded' })
                .eq('id', reg.id);

              if (updateErr) throw new Error(updateErr.message);

              refundResults.push({ userId: reg.user_id, amount: reg.buy_in_amount, success: true });
            } catch (refErr) {
              console.warn(`[Tournament] Refund FAILED for user ${reg.user_id}:`, refErr.message);
              failedRefunds.push({ userId: reg.user_id, amount: reg.buy_in_amount, error: 'Refund failed' });
            }
          }

          // ── Safety wire: ONLY mark cancelled if ALL refunds succeeded ──
          if (failedRefunds.length > 0) {
            console.warn(`[Tournament] CANCEL ABORTED: ${failedRefunds.length}/${(registrations || []).length} refunds failed`);
            return res.status(500).json({
              success: false,
              error: `Cancel aborted: ${failedRefunds.length} refund(s) failed. Tournament status unchanged.`,
              refunded: refundResults.length,
              failed: failedRefunds,
              totalRegistrations: (registrations || []).length,
            });
          }

          // All refunds verified — NOW safe to update status
          const { error: err_club_tournaments_87xz1 } = await getSupabase()
            .from('club_tournaments')
            .update({ status: 'cancelled' })
            .eq('id', tournamentId);
          if (err_club_tournaments_87xz1) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_87xz1.message);

          return res.json({ success: true, refunded: (registrations || []).length });
        }

        // ═══════════════════════════════════════════════════════
        // UPDATE (EDIT TOURNAMENT — PRE-START ONLY) [Improvement #9]
        // ═══════════════════════════════════════════════════════
        case 'update': {
          const { tournamentId, updates } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });
          if (!updates || typeof updates !== 'object') return res.status(400).json({ success: false, error: 'updates object required' });

          // Fetch tournament
          const { data: tourn } = await getSupabase()
            .from('club_tournaments')
            .select('*')
            .eq('id', tournamentId)
            .maybeSingle();

          if (!tourn) return res.status(404).json({ success: false, error: 'Tournament not found' });

          // Only editable before running
          if (!['scheduled', 'registering'].includes(tourn.status)) {
            return res.status(400).json({ success: false, error: 'Cannot edit a tournament that has already started' });
          }

          // Verify admin
          const { data: updMember } = await getSupabase()
            .from('club_members')
            .select('role')
            .eq('club_id', tourn.club_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!updMember || !['owner', 'admin', 'super_agent'].includes(updMember.role)) {
            return res.status(403).json({ success: false, error: 'Only club admins can edit tournaments' });
          }

          // Whitelist of editable fields
          const allowedFields = [
            'name', 'buy_in', 'max_players', 'starting_chips', 'variant',
            'scheduled_start', 'late_reg_levels', 'guaranteed_prize',
          ];
          const safeUpdates = {};
          for (const [key, val] of Object.entries(updates || {})) {
            if (allowedFields.includes(key)) safeUpdates[key] = val;
          }

          // Also allow editing settings sub-fields
          if (updates.settings && typeof updates.settings === 'object') {
            const existingSettings = tourn.settings || {};
            safeUpdates.settings = { ...existingSettings, ...updates.settings };
          }

          if (Object.keys(safeUpdates || {}).length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
          }

          const { error: updErr } = await getSupabase()
            .from('club_tournaments')
            .update(safeUpdates)
            .eq('id', tournamentId);

          if (updErr) {
            console.warn('[Tournament] Update failed:', updErr);
            return res.status(500).json({ success: false, error: 'Update failed' });
          }

          return res.json({ success: true, updated: Object.keys(safeUpdates || {}) });
        }

        // ═══════════════════════════════════════════════════════
        // SPIN & GO MULTIPLIER DRAWING [Improvement #10]
        // ═══════════════════════════════════════════════════════
        case 'spin_draw_multiplier': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

          const { data: tourn } = await getSupabase()
            .from('club_tournaments')
            .select('*')
            .eq('id', tournamentId)
            .maybeSingle();

          if (!tourn) return res.status(404).json({ success: false, error: 'Tournament not found' });
          if (tourn.type !== 'spin') return res.status(400).json({ success: false, error: 'Not a Spin & Go tournament' });

          // If already drawn, return the existing multiplier
          if (tourn.spin_multiplier) {
            return res.json({ success: true, multiplier: tourn.spin_multiplier, alreadyDrawn: true });
          }

          // Weighted probability table (standard Spin & Go distribution)
          const multiplierTable = [
            { multiplier: 2, weight: 750000 }, // 75%
            { multiplier: 3, weight: 125000 }, // 12.5%
            { multiplier: 5, weight: 75000 }, // 7.5%
            { multiplier: 10, weight: 35000 }, // 3.5%
            { multiplier: 25, weight: 10000 }, // 1.0%
            { multiplier: 50, weight: 3500 }, // 0.35%
            { multiplier: 100, weight: 1000 }, // 0.1%
            { multiplier: 250, weight: 400 }, // 0.04%
            { multiplier: 1000, weight: 100 }, // 0.01%
          ];

          const totalWeight = multiplierTable.reduce((s, e) => s + e.weight, 0);
          let roll = crypto.randomInt(0, totalWeight);
          let drawnMultiplier = 2; // fallback
          for (const entry of multiplierTable) {
            roll -= entry.weight;
            if (roll <= 0) { drawnMultiplier = entry.multiplier; break; }
          }

          // Compute prize pool
          const basePrize = (tourn.buy_in || 0) * (tourn.max_players || 3);
          const spinPrizePool = basePrize * drawnMultiplier;

          // Persist the drawn multiplier and prize pool
          const { error: err_club_tournaments_euxmn } = await getSupabase()
            .from('club_tournaments')
            .update({ spin_multiplier: drawnMultiplier, prize_pool: spinPrizePool })
            .eq('id', tournamentId);
          if (err_club_tournaments_euxmn) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_euxmn.message);

          console.info(`[Tournament] Spin & Go multiplier drawn: ${drawnMultiplier}x for ${tournamentId}`);
          return res.json({ success: true, multiplier: drawnMultiplier, prizePool: spinPrizePool });
        }

        default:
          return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (err) {
      console.warn('[club-arena/tournaments]', err);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
