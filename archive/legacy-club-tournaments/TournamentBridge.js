/**
 * 🏆 TOURNAMENT BRIDGE
 * ═══════════════════════════════════════════════════════════════
 * 
 * Connects TournamentController ↔ GameController/LobbyManager
 * 
 * Problem: TournamentController creates its own TableManager instances
 * but they aren't registered with LobbyManager (no realtime, no persistence).
 * 
 * Solution: This bridge:
 *   1. Registers tournament tables with LobbyManager for realtime broadcasting
 *   2. Persists tournament state to Supabase (club_tournaments table)
 *   3. Wires elimination/rebalance events to realtime channels
 *   4. Provides DB persistence for tournament lifecycle
 * 
 * Usage:
 *   const bridge = new TournamentBridge(controller, lobby, supabase);
 *   bridge.wire();
 * ═══════════════════════════════════════════════════════════════
 */

const { RealtimeSync } = require('./RealtimeSync');
const { HandHistoryRecorder } = require('./HandHistory');
const { ActionTimer } = require('./ActionTimer');
const ChipBridge = require('./ChipBridge');

class TournamentBridge {
  /**
   * @param {import('./TournamentController').TournamentController} tournament
   * @param {import('./LobbyManager').LobbyManager} lobby
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(tournament, lobby, supabase) {
    this.tournament = tournament;
    this.lobby = lobby;
    this.supabase = supabase;
    this._wired = false;
    this._tableCleanup = new Map(); // tableId → cleanup functions
    // Persistent Realtime channel for tournament-wide events.
    // Created once in wire(), reused by _broadcastTournament().
    // Ephemeral channels (created per-broadcast) were the prior bug —
    // they had no subscribers by the time send() was called.
    this._tournamentChannel = null;
  }

  /**
   * Wire all tournament events to the lobby and database.
   */
  async wire() {
    if (this._wired) return;
    this._wired = true;

    // Create the persistent tournament broadcast channel
    if (this.supabase && this.tournament.tournamentId) {
      this._tournamentChannel = this.supabase.channel(
        `tournament:${this.tournament.tournamentId}`,
        { config: { broadcast: { ack: false } } }
      );
      this._tournamentChannel.on('system', {}, (status) => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { console.warn('[TournamentBridge] Channel error:', status); } });
      await this._tournamentChannel.subscribe();
    }

    const t = this.tournament;

    // ── TABLE LIFECYCLE ──────────────────────────────────────
    t.on('table_created', ({ tableId, tableNumber }) => {
      this._registerTable(tableId).catch(err =>
        console.warn(`[TournamentBridge] _registerTable failed for ${tableId}:`, err.message)
      );
    });

    t.on('table_closed', ({ tableId }) => {
      this._unregisterTable(tableId);
    });

    // ── TOURNAMENT LIFECYCLE ─────────────────────────────────
    t.on('tournament_started', async (data) => {
      // Register ALL initial tables (created before this event fires)
      for (const [tableId] of t.tables) {
        if (!this.lobby.tables.has(tableId)) {
          this._registerTable(tableId);
        }
      }
      await this._persistState('running', data);
      this._broadcastTournament('tournament_started', data);
    });

    t.on('tournament_complete', async (data) => {
      await this._persistState('complete', data);
      this._broadcastTournament('tournament_complete', data);

      // ── CRITICAL: Credit tournament payouts to player chip balances ──
      // Primary path: TournamentController.ledger.creditWinnings() runs BEFORE this event
      // Fallback path: Direct RPC credit here ONLY if ledger was not wired
      const ledgerHandled = !!t.ledger;
      if (!ledgerHandled && this.supabase && data.payouts?.length > 0) {
        const clubId = t.clubId;
        for (const payout of data.payouts) {
          if (payout.amount > 0 && payout.playerId) {
            const targetClubId = payout.clubId || clubId;
            if (!targetClubId) continue;
            try {
              // Credit chips via atomic RPC
              const { error: creditErr } = await this.supabase.rpc('fn_credit_chips', {
                p_club_id: targetClubId,
                p_user_id: payout.playerId,
                p_amount: payout.amount,
              });

              if (!creditErr) {
                // Record transaction
                const { error: err_chip_transactions_ko6eh } = await this.supabase.from('chip_transactions').insert({
                  club_id: targetClubId,
                  to_user_id: payout.playerId,
                  amount: payout.amount,
                  transaction_type: 'tournament_payout',
                  notes: `Tournament payout: ${payout.place}${payout.place === 1 ? 'st' : payout.place === 2 ? 'nd' : payout.place === 3 ? 'rd' : 'th'} place — ${t.name || t.tournamentId}`,
                });
                if (err_chip_transactions_ko6eh) console.warn('[Supabase] Silent mutation failed in chip_transactions:', err_chip_transactions_ko6eh.message);

                console.debug(`[TournamentBridge] Credited ${payout.amount} chips to ${payout.playerId} (${payout.place} place)`);
              } else {
                console.warn(`[TournamentBridge] Payout credit failed for ${payout.playerId}:`, creditErr.message);
              }
            } catch (err) {
              console.warn(`[TournamentBridge] Payout error for ${payout.playerId}:`, err.message);
            }
          }
        }
      }

      // ── BUG #163 FIX: Release held_chips for ALL registrants ──
      // Registration used lock_chips_for_table which moved buy-in from
      // chip_balance → held_chips. Payouts already credited winners via
      // fn_credit_chips. But held_chips is never cleared — chips stay
      // permanently frozen. Release via atomic RPC.
      if (this.supabase) {
        const tournId = t.tournamentId;
        const clubId = t.clubId;
        try {
          const { data: releaseResult, error: releaseErr } = await this.supabase
            .rpc('fn_release_tournament_holds', {
              p_tournament_id: tournId,
              p_club_id: clubId,
            });

          if (releaseErr) {
            console.warn('[TournamentBridge] held_chips release RPC failed:', releaseErr.message);
          } else {
            console.debug(`[TournamentBridge] Released held_chips for ${releaseResult?.released_count || 0} registrants`);
          }
        } catch (err) {
          console.warn('[TournamentBridge] held_chips cleanup error:', err.message);
        }
      }

      // Cleanup all tables after a delay
      setTimeout(() => this._cleanupAll(), 30000);
    });

    t.on('tournament_cancelled', async (data) => {
      await this._persistState('cancelled', data);
      this._broadcastTournament('tournament_cancelled', data);
      this._cleanupAll();
    });

    // ── PLAYER EVENTS ────────────────────────────────────────
    t.on('player_registered', (data) => {
      this._broadcastTournament('player_registered', data);
      this._persistRegistration(data);
    });

    t.on('player_unregistered', (data) => {
      this._broadcastTournament('player_unregistered', data);
    });

    t.on('player_seated', (data) => {
      this._broadcastTournament('player_seated', data);
    });

    t.on('player_busted', (data) => {
      this._broadcastTournament('player_busted', data);
    });

    t.on('player_eliminated', async (data) => {
      this._broadcastTournament('player_eliminated', data);
      await this._persistElimination(data);
    });

    t.on('player_moved', (data) => {
      this._broadcastTournament('player_moved', data);
      // Re-register destination table if needed
      if (!this.lobby.tables.has(data.toTable)) {
        this._registerTable(data.toTable);
      }
    });

    t.on('player_rebuy', async (data) => {
      this._broadcastTournament('player_rebuy', data);
      await this._persistState(this.tournament.status, data); // Updates prize_pool dynamically
      await this._persistRebuy(data);
      if (data.playerId && data.amount) {
        this._recordAuditLog('rebuy', data.playerId, data.amount, { tournamentId: this.tournament.tournamentId });
      }
    });

    t.on('player_addon', async (data) => {
      this._broadcastTournament('player_addon', data);
      await this._persistState(this.tournament.status, data); // Updates prize_pool dynamically
      await this._persistAddon(data);
      if (data.playerId && data.amount) {
        this._recordAuditLog('addon', data.playerId, data.amount, { tournamentId: this.tournament.tournamentId });
      }
    });

    // ── BLIND / LEVEL EVENTS ─────────────────────────────────
    t.on('level_change', async (data) => {
      this._broadcastTournament('level_change', data);
      await this._persistLevelChange(data);
    });

    t.on('break_started', (data) => {
      this._broadcastTournament('break_started', data);
    });

    t.on('break_ended', (data) => {
      this._broadcastTournament('break_ended', data);
    });

    // ── PAYOUT EVENTS ────────────────────────────────────────
    t.on('payout_awarded', async (data) => {
      this._broadcastTournament('payout_awarded', data);
      await this._persistPayout(data);
      if (data.playerId && data.amount) {
        this._recordAuditLog('payout_awarded', data.playerId, data.amount, { tournamentId: this.tournament.tournamentId, placement: data.placement });
      }
    });

    t.on('victory', async (data) => {
      this._broadcastTournament('victory', data);
    });

    // ── BOUNTY EVENTS ────────────────────────────────────────
    t.on('bounty_awarded', (data) => {
      this._broadcastTournament('bounty_awarded', data);
      this._persistBountyAward(data);
    });

    t.on('mystery_bounty_awarded', async (data) => {
      this._broadcastTournament('mystery_bounty_awarded', data);
      await this._persistBountyAward(data);

      // Phase 7: Broadcast mystery bounty to all tournament tables' chat AND trigger God-Mode Table-Wide Confetti
      if (this.supabase && data.reveal) {
        const chatMsg = `🎰 ${data.playerName} pulled a ${data.reveal.tierLabel} Mystery Bounty (${data.amount.toLocaleString()} chips) for knocking out ${data.eliminatedName}!`;
        for (const [tableId] of this.tournament.tables) {
          try {
            // Send to chat
            const tableChannel = this.supabase.channel(`table:${tableId}`);
            tableChannel.send({
              type: 'broadcast',
              event: 'chat_message',
              payload: { type: 'system', message: chatMsg }
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

            // PHASE 3 EXPANSION: Trigger Table-Wide Confetti for everyone seated at any tournament table
            // The frontend table/[tableId].js listens to this channel and renders MysteryBountyReveal overlay
            const bountyChannel = this.supabase.channel(`bounty-reveal:${tableId}`);
            bountyChannel.send({
              type: 'broadcast',
              event: 'mystery_bounty_awarded',
              payload: data
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
            
            // Clean up ephemeral channels
            setTimeout(() => {
              this.supabase.removeChannel(tableChannel);
              this.supabase.removeChannel(bountyChannel);
            }, 1000);
          } catch (e) {
            console.warn('[TournamentBridge] Chat/Bounty broadcast failed for table', tableId, e.message);
          }
        }
      }

      // Phase 7: Club-wide announcement for Jackpot bounties
      if (data.reveal?.isJackpot && this.supabase && this.tournament.clubId) {
        try {
          const title = `🎰 JACKPOT BOUNTY: ${data.amount.toLocaleString()} Chips!`;
          const content = `${data.playerName} just won a massive ${data.reveal.tierLabel} Mystery Bounty by knocking out ${data.eliminatedName} in ${this.tournament.name}!`;

          const { error: err_club_announcements_h67ri } = await this.supabase.from('club_announcements').insert({
            club_id: this.tournament.clubId,
            author_id: data.playerId, // Associate with the winner
            title,
            content,
            pinned: false
          });

          if (err_club_announcements_h67ri) console.warn('[Supabase] Silent mutation failed in club_announcements:', err_club_announcements_h67ri.message);

          // Phase 8: Push Notifications for massive wins
          // Dynamically import to handle ESM/CJS interop in the NextJS API environment
          try {
            const { notifyJackpotBounty } = await import('../commander/pushNotifications.js');
            // Get all player IDs in the tournament for the push push notification audience
            const allPlayerIds = Array.from(this.tournament.entries.keys());
            let tournamentPlayerIds = [];

            if (allPlayerIds.length > 0) {
              // Filter out players who opted out of bounty alerts
              const { data: profiles } = await this.supabase
                .from('profiles')
                .select('id, settings')
                .in('id', allPlayerIds);

              if (profiles) {
                tournamentPlayerIds = profiles
                  .filter(p => !p.settings || p.settings.bountyAlerts !== false)
                  .map(p => p.id);
              } else {
                tournamentPlayerIds = allPlayerIds; // Fallback to all if query fails
              }
            }

            if (tournamentPlayerIds.length > 0) {
              // Note: We need the club name. We can fetch it, or just use 'The Club' as fallback.
              let clubName = 'The Club';
              const { data: clubData } = await this.supabase
                .from('clubs')
                .select('name')
                .eq('id', this.tournament.clubId)
                .maybeSingle();
              if (clubData) clubName = clubData.name;

              await notifyJackpotBounty(
                tournamentPlayerIds,
                clubName,
                this.tournament.name || 'a Tournament',
                data.playerName,
                data.amount,
                data.reveal.tierLabel
              );
            }
          } catch (pushErr) {
            console.warn('[TournamentBridge] Push notification failed:', pushErr.message);
          }

          // Broadcast a trigger to the club channel:
          const clubChannel = this.supabase.channel(`club:${this.tournament.clubId}`);
          await clubChannel.send({
            type: 'broadcast',
            event: 'new_announcement',
            payload: { title }
          });
          this.supabase.removeChannel(clubChannel);
        } catch (err) {
          console.warn('[TournamentBridge] Jackpot announcement failed:', err.message);
        }
      }
    });
  }

  /**
   * Register a tournament table with LobbyManager for realtime broadcasting.
   * @param {string} tableId
   * @private
   */
  async _registerTable(tableId) {
    const tableInfo = this.tournament.tables.get(tableId);
    if (!tableInfo) return;

    const table = tableInfo.table;

    // If lobby already has it, skip
    if (this.lobby.tables.has(tableId)) return;

    // Create supporting objects
    const timer = new ActionTimer({
      turnTime: this.tournament.actionTime || 30000,
      timeBank: this.tournament.timeBankSeconds || 30000,
    });

    // Wire timer into table manager for pause/resume control
    table.timer = timer;
    if (table.game) {
      table.game.timer = timer;
    }

    // Wire timer to table
    timer.on('turn_timeout', ({ playerId }) => {
      const seat = table.seats.find(s => s.player?.id === playerId);
      if (seat && table.game.phase !== 'idle') {
        table.processAction(playerId, { type: 'fold' });
      }
    });

    // Create RealtimeSync with correct config-object constructor
    const sync = new RealtimeSync({
      supabase: this.supabase,
      tableId,
      tableManager: table,
      actionTimer: timer,
    });
    await sync.initialize();

    // Wire StateSerializer for tournament table crash recovery
    const { StateSerializer } = require('./StateSerializer');
    const serializer = new StateSerializer(tableId, this.supabase);
    serializer.wire(table);

    // Wire hand history recording
    const history = new HandHistoryRecorder({
      tableId,
      clubId: this.tournament.clubId,
      supabase: this.supabase,
    });
    const tableConfig = {
      tableId,
      clubId: this.tournament.clubId,
      bigBlind: table.bigBlind || this.tournament.blindStructure?.[0]?.big_blind || 2,
      variant: this.tournament.variant || 'nlh',
    };
    const getSync = () => this.lobby.tables.get(tableId)?.sync;
    this.lobby._wireHandHistory(table, history, tableConfig, getSync);

    // Register with lobby
    // Also set tournament metadata directly on the TableManager instance
    // so getState() can include it in the config block (used by realtime broadcasts)
    table.isTournament = true;
    table.tournamentId = this.tournament.tournamentId;
    table.tournamentName = this.tournament.name || null;
    table.buyIn = this.tournament.buyinAmount || 0;

    this.lobby.tables.set(tableId, {
      table,
      config: {
        tableId,
        name: `Tournament Table ${tableId.split('_').pop()}`,
        variant: this.tournament.variant || 'holdem',
        maxSeats: this.tournament.maxTableSize || 9,
        smallBlind: table.smallBlind,
        bigBlind: table.bigBlind,
        tournamentId: this.tournament.tournamentId,
        tournamentName: this.tournament.name || null,
        buyIn: this.tournament.buyinAmount || 0,
        isTournament: true,
        createdAt: new Date().toISOString(),
      },
      sync,
      history,
      timer,
      serializer,
    });

    // Store cleanup function
    this._tableCleanup.set(tableId, () => {
      sync.destroy();
      timer.destroy();
      serializer.destroy();
    });
  }

  /**
   * Unregister a tournament table from LobbyManager.
   * @param {string} tableId
   * @private
   */
  _unregisterTable(tableId) {
    const cleanup = this._tableCleanup.get(tableId);
    if (cleanup) cleanup();
    this._tableCleanup.delete(tableId);
    this.lobby.tables.delete(tableId);
  }

  /**
   * Broadcast a tournament-wide event to all connected clients.
   * Uses the persistent _tournamentChannel created in wire().
   * Also echoes to each active table channel for players already in-game.
   * @param {string} event
   * @param {Object} data
   * @private
   */
  _broadcastTournament(event, data) {
    const payload = {
      ...data,
      tournamentId: this.tournament.tournamentId,
    };

    // 1. Persistent dedicated tournament channel (registered clients listen here)
    if (this._tournamentChannel) {
      this._tournamentChannel.send({
        type: 'broadcast',
        event,
        payload,
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // Non-blocking, non-critical
    }

    // 2. Also broadcast to each active table channel (players in-game see it too)
    for (const [tableId] of this.tournament.tables) {
      const entry = this.lobby.tables.get(tableId);
      if (entry?.sync?.channel) {
        entry.sync.channel.send({
          type: 'broadcast',
          event: `tournament:${event}`,
          payload,
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // DATABASE PERSISTENCE
  // ═══════════════════════════════════════════════════════════

  async _persistState(status, data) {
    if (!this.supabase) return;
    try {
      const t = this.tournament;

      // ── Build bounty summary for completed tournaments ──
      let bountyResults = null;
      if (status === 'complete' && t.bountyManager) {
        try {
          const bm = t.bountyManager;
          bountyResults = {
            bountyType: bm.bountyType || t.bountyType || null,
            totalBountyPool: bm.totalBountyPool || 0,
            totalBountiesAwarded: bm.totalBountiesAwarded || 0,
            mysteryPhaseActive: bm.mysteryPhaseActive || false,
            mysteryEnvelopesRemaining: bm._mysteryEnvelopes?.length || 0,
            awards: (bm.bountyHistory || []).map(a => ({
              playerId: a.eliminatorId,
              eliminatedId: a.eliminatedId || null,
              amount: a.amount,
              type: a.type,
              timestamp: a.timestamp || null,
            })),
            leaderboard: [...(bm.playerBounties?.values() || [])].filter(p => p.bountyEarnings > 0)
              .map(p => ({
                playerId: p.playerId,
                playerName: p.playerName || null,
                totalBounties: p.bountyEarnings,
                eliminationCount: p.eliminationCount || 0,
              })).sort((a, b) => b.totalBounties - a.totalBounties),
          };
        } catch (bErr) {
          console.warn('[TournamentBridge] Bounty results capture error:', bErr.message);
        }
      }

      const updatePayload = {
        status,
        current_level: t.currentLevel,
        players_remaining: t._getActivePlayers?.().length || 0,
        tables_active: t.tables.size,
        hands_played: t.handsPlayed || 0,
        prize_pool: t.prizePool || 0,
        spin_multiplier: t.spinMultiplier || null,
        updated_at: new Date().toISOString(),
        ...(status === 'complete' ? { completed_at: new Date().toISOString() } : {}),
        ...(status === 'cancelled' ? { cancelled_at: new Date().toISOString() } : {}),
      };

      // Merge bounty results into the settings JSONB for completed tournaments
      if (bountyResults) {
        // Read current settings to merge
        const { data: existing } = await this.supabase
          .from('club_tournaments')
          .select('settings')
          .eq('id', t.tournamentId)
          .maybeSingle();
        const currentSettings = existing?.settings || {};
        updatePayload.settings = {
          ...currentSettings,
          bounty_results: bountyResults,
        };
      }

      const { error: err_club_tournaments_3dvmd } = await this.supabase

        .from('club_tournaments')

        .update(updatePayload)
        .eq('id', t.tournamentId);

      if (err_club_tournaments_3dvmd) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_3dvmd.message);
    } catch (err) {
      console.warn('[TournamentBridge] Persist state error:', err.message);
    }
  }

  async _persistLevelChange(data) {
    if (!this.supabase) return;
    try {
      const { error: err_club_tournaments_orzyt } = await this.supabase
        .from('club_tournaments')
        .update({
          current_level: data.level,
          current_small_blind: data.smallBlind,
          current_big_blind: data.bigBlind,
          current_ante: data.ante || 0,
          players_remaining: data.playersRemaining || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.tournament.tournamentId);
      if (err_club_tournaments_orzyt) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_orzyt.message);
    } catch (err) {
      console.warn('[TournamentBridge] Level change persist error:', err.message);
    }
  }

  async _persistRegistration(data) {
    if (!this.supabase) return;
    try {
      const { error: err_tournament_entries_66141 } = await this.supabase
        .from('tournament_entries')
        .upsert({
          tournament_id: this.tournament.tournamentId,
          player_id: data.playerId,
          player_name: data.playerName,
          status: 'registered',
          // Phase 48e FIX #10b: property is buyinAmount, not buyIn
          buy_in: this.tournament.buyinAmount,
          registered_at: new Date().toISOString(),
        }, { onConflict: 'tournament_id,player_id' });
      if (err_tournament_entries_66141) console.warn('[Supabase] Silent mutation failed in tournament_entries:', err_tournament_entries_66141.message);
    } catch (err) {
      console.warn('[TournamentBridge] Registration persist error:', err.message);
    }
  }

  async _persistElimination(data) {
    if (!this.supabase) return;
    try {
      const { error: err_tournament_entries_77ujk } = await this.supabase
        .from('tournament_entries')
        .update({
          status: 'eliminated',
          finish_position: data.finishPosition,
          eliminated_at: new Date().toISOString(),
          payout: data.payout || 0,
        })
        .eq('tournament_id', this.tournament.tournamentId)
        .eq('player_id', data.playerId);
      if (err_tournament_entries_77ujk) console.warn('[Supabase] Silent mutation failed in tournament_entries:', err_tournament_entries_77ujk.message);

      // Deep Bug Hunt Parity Fix: 
      // Mirror the elimination payload to `tournament_registrations` so the frontend UI
      // immediately updates finish position, payout, and status for both Humans and AI.
      const { error: err_tournament_registrations_a6e41 } = await this.supabase
        .from('tournament_registrations')
        .update({
          status: 'eliminated',
          finish_position: data.finishPosition,
          payout_amount: data.payout || 0,
        })
        .eq('tournament_id', this.tournament.tournamentId)
        .eq('user_id', data.playerId);
      if (err_tournament_registrations_a6e41) console.warn('[Supabase] Silent mutation failed in tournament_registrations:', err_tournament_registrations_a6e41.message);

    } catch (err) {
      console.warn('[TournamentBridge] Elimination persist error:', err.message);
    }
  }

  async _persistPayout(data) {
    if (!this.supabase) return;
    try {
      const { error: err_tournament_entries_bf9yt } = await this.supabase
        .from('tournament_entries')
        .update({
          payout: data.amount,
          finish_position: data.position,
        })
        .eq('tournament_id', this.tournament.tournamentId)
        .eq('player_id', data.playerId);
      if (err_tournament_entries_bf9yt) console.warn('[Supabase] Silent mutation failed in tournament_entries:', err_tournament_entries_bf9yt.message);
    } catch (err) {
      console.warn('[TournamentBridge] Payout persist error:', err.message);
    }
  }

  async _persistRebuy(data) {
    if (!this.supabase) return;
    try {
      const entry = this.tournament.entries.get(data.playerId);
      if (!entry) return;
      const { error: err_tournament_entries_xmlzk } = await this.supabase
        .from('tournament_entries')
        .update({
          status: 'active',
          rebuy_count: entry.rebuyCount,
          total_invested: entry.totalInvested,
        })
        .eq('tournament_id', this.tournament.tournamentId)
        .eq('player_id', data.playerId);
      if (err_tournament_entries_xmlzk) console.warn('[Supabase] Silent mutation failed in tournament_entries:', err_tournament_entries_xmlzk.message);

      // Mirror to UI Table
      const { error: err_tournament_registrations_356vz } = await this.supabase
        .from('tournament_registrations')
        .update({
          status: 'registered', // 'registered' is the UI's active state
          // Depending on schema, we optionally update investment here if tracked.
        })
        .eq('tournament_id', this.tournament.tournamentId)
        .eq('user_id', data.playerId);
      if (err_tournament_registrations_356vz) console.warn('[Supabase] Silent mutation failed in tournament_registrations:', err_tournament_registrations_356vz.message);

    } catch (err) {
      console.warn('[TournamentBridge] Rebuy persist error:', err.message);
    }
  }

  async _persistAddon(data) {
    if (!this.supabase) return;
    try {
      const entry = this.tournament.entries.get(data.playerId);
      if (!entry) return;
      const { error: err_tournament_entries_yuj97 } = await this.supabase
        .from('tournament_entries')
        .update({
          addon_taken: true,
          total_invested: entry.totalInvested,
        })
        .eq('tournament_id', this.tournament.tournamentId)
        .eq('player_id', data.playerId);
      if (err_tournament_entries_yuj97) console.warn('[Supabase] Silent mutation failed in tournament_entries:', err_tournament_entries_yuj97.message);

      // Mirror to UI Table (No status change, just ensuring hooks match if needed)
    } catch (err) {
      console.warn('[TournamentBridge] Add-on persist error:', err.message);
    }
  }

  /**
   * Persist a bounty award to the database.
   * @private
   */
  async _persistBountyAward(data) {
    if (!this.supabase) return;
    try {
      // Update the eliminator's bounty earnings in tournament_registrations
      if (data.playerId && data.amount > 0) {
        // Use raw SQL increment via RPC for atomicity to prevent double-knockout race conditions
        const { error } = await this.supabase
          .rpc('increment_tournament_bounty', {
            p_tournament_id: this.tournament.tournamentId,
            p_user_id: data.playerId,
            p_amount: data.amount
          });

        if (error) {
          // Fallback if RPC doesn't exist yet
          const { data: reg } = await this.supabase
            .from('tournament_registrations')
            .select('payout_amount')
            .eq('tournament_id', this.tournament.tournamentId)
            .eq('user_id', data.playerId)
            .maybeSingle();
          if (reg) {
            const { error: err_tournament_registrations_pci5a } = await this.supabase
              .from('tournament_registrations')
              .update({
                payout_amount: (reg.payout_amount || 0) + data.amount,
              })
              .eq('tournament_id', this.tournament.tournamentId)
              .eq('user_id', data.playerId);
            if (err_tournament_registrations_pci5a) console.warn('[Supabase] Silent mutation failed in tournament_registrations:', err_tournament_registrations_pci5a.message);
          }
        }
      }

      // [HARDENING: PRO PHASE 10] Master Audit Trail for Mystery Bounties
      // If this is a mystery bounty, save the exact envelope draw to the database.
      if (data.type === 'mystery_bounty' && data.reveal && data.eliminatedId) {
        const { error: err_tournament_mystery_draws_fk0av } = await this.supabase.from('tournament_mystery_draws').insert({
          tournament_id: this.tournament.tournamentId,
          eliminator_id: data.playerId,
          eliminated_id: data.eliminatedId,
          amount: data.amount,
          tier_label: data.reveal.tierLabel || 'Prize',
          multiplier: data.reveal.multiplier || 1,
          remaining_envelopes: data.reveal.remainingEnvelopes || []
        });
        if (err_tournament_mystery_draws_fk0av) console.warn('[Supabase] Silent mutation failed in tournament_mystery_draws:', err_tournament_mystery_draws_fk0av.message);
      }
    } catch (err) {
      console.warn('[TournamentBridge] Bounty award persist error:', err.message);
    }
  }

  /**
   * Clean up all tournament tables.
   * @private
   */
  _cleanupAll() {
    for (const [tableId] of this._tableCleanup) {
      this._unregisterTable(tableId);
    }
  }

  /**
   * Get full tournament state for API responses.
   */
  getState() {
    const t = this.tournament;
    const activePlayers = t._getActivePlayers?.() || [];
    return {
      tournamentId: t.tournamentId,
      name: t.name,
      status: t.status,
      type: t.tournamentType,
      variant: t.variant,
      currentLevel: t.currentLevel,
      blinds: t.currentLevel > 0 ? t.getCurrentBlinds() : null,
      nextBlinds: t.getNextBlinds?.() || null,
      levelTimeRemaining: t.getLevelTimeRemaining?.() || 0,
      playersRemaining: activePlayers.length,
      totalEntries: t.entries?.size || 0,
      averageStack: activePlayers.length > 0 ? Math.round((t.totalChipsInPlay || 0) / activePlayers.length) : 0,
      tablesActive: t.tables.size,
      prizePool: t.prizePool || 0,
      handsPlayed: t.handsPlayed || 0,
      spinMultiplier: t.spinMultiplier || null,
      rebuyEndLevel: t.rebuyEndLevel || null,
      addonAtBreak: t.addonAtBreak || null,
      lateRegOpen: t.currentLevel <= (t.lateRegLevels || 0) && t.lateRegLevels > 0 &&
        ['running', 'late_reg'].includes(t.status),
      totalRebuys: t.totalRebuys || 0,
      totalAddons: t.totalAddons || 0,
      tables: [...t.tables.entries()].map(([id, info]) => ({
        tableId: id,
        players: info.table.seats
          .filter(s => s.player)
          .map(s => ({
            playerId: s.player.id,
            displayName: s.player.displayName,
            stack: s.stack,
            seatIndex: s.seatIndex,
          })),
        handInProgress: info.table.game?.phase !== 'idle',
      })),
      entries: [...(t.entries?.values() || [])].map(e => ({
        playerId: e.playerId,
        playerName: e.playerName,
        status: e.status,
        chips: e.chips,
        tableId: e.tableId,
        finishPosition: e.finishPosition,
        rebuyCount: e.rebuyCount,
      })),
      // ── Bounty State ──
      bountyType: t.bountyType !== 'none' ? t.bountyType : undefined,
      bountyState: t.bountyManager ? t.bountyManager.getState() : undefined,
    };
  }

  /**
   * Internal helper to record tournament-level chip movements to the audit log.
   * @private
   */
  _recordAuditLog(actionType, userId, amount, details = {}) {
    if (!this.tournament || !this.tournament.clubId || !userId) return;
    try {
      const sb = ChipBridge.getSupabase();
      sb.rpc('record_arena_audit_log', {
        p_club_id: this.tournament.clubId,
        // Phase 48e FIX #10a: property is tournamentId, not id
        p_table_id: `tournament_${this.tournament.tournamentId}`,
        p_user_id: userId,
        p_action_type: `tournament_${actionType}`,
        p_amount: amount || 0,
        p_details: details
      }).catch(err => console.warn('[TournamentBridge.AuditLog] RPC error:', err.message));
    } catch (e) {
      console.warn('[TournamentBridge.AuditLog] Sync Error:', e.message);
    }
  }

  /**
   * Destroy the bridge and clean up.
   */
  destroy() {
    this._cleanupAll();
    // Clean up persistent broadcast channel
    if (this._tournamentChannel && this.supabase) {
      this.supabase.removeChannel(this._tournamentChannel).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      this._tournamentChannel = null;
    }
    this._wired = false;
  }
}

module.exports = { TournamentBridge };
