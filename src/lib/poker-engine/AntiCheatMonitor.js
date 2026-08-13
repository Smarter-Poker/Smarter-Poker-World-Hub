/**
 * 🛡️ ANTI-CHEAT BACKGROUND MONITOR
 * ═══════════════════════════════════════════════════════════════
 * 
 * Fully automated. No manual approvals. No human in the loop.
 * 
 * Runs on a configurable interval (default 30s) and scans ALL
 * active tables for violations. When detected → instant auto-boot.
 * 
 * Checks:
 *   1. GPS Proximity — Players too close together at same table
 *   2. Downline Violations — Too many players from same agent
 *   3. IP Conflicts — Multiple players sharing IP at same table
 *   4. Bot Patterns — Accumulated timing/action analysis
 *   5. Collusion Patterns — Coordinated fold/dump behavior
 * 
 * On violation:
 *   → Force stand-up via GameController
 *   → Unlock chips via ChipBridge
 *   → Log flag + event to database
 *   → Player sees "Removed for anti-cheat violation" in real-time
 * 
 * ═══════════════════════════════════════════════════════════════
 */

const ChipBridge = require('./ChipBridge');

const SCAN_INTERVAL_MS = 30_000;  // 30 seconds between full scans
const GPS_STALE_MS = 300_000;     // GPS data older than 5min is stale
const BOOT_COOLDOWN_MS = 60_000;  // Don't re-boot same player within 60s

class AntiCheatMonitor {
  /**
   * @param {object} controller - GameController instance
   * @param {object} antiCheat  - AntiCheat instance (has GPS/IP/downline data)
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(controller, antiCheat, supabase) {
    this.controller = controller;
    this.antiCheat = antiCheat;
    this.supabase = supabase;
    this._interval = null;
    this._bootLog = new Map(); // `${playerId}:${tableId}` → lastBootTimestamp
    this._running = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  start() {
    if (this._interval) return;
    console.debug('[AntiCheatMonitor] ✅ Started — scanning every', SCAN_INTERVAL_MS / 1000, 'seconds');
    this._interval = setInterval(() => this.scan(), SCAN_INTERVAL_MS);
    // Run first scan after 10s to let tables initialize
    setTimeout(() => this.scan(), 10_000);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
      console.debug('[AntiCheatMonitor] ⏹️  Stopped');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN SCAN — Runs every interval, checks every active table
  // ═══════════════════════════════════════════════════════════════

  async scan() {
    if (this._running) return; // Skip if previous scan still running
    this._running = true;

    try {
      const lobby = this.controller.lobby;
      if (!lobby?.tables) return;

      let tablesScanned = 0;
      let violationsFound = 0;

      for (const [tableId, entry] of lobby.tables) {
        // Phase 48e FIX #13: LobbyManager stores entries as { table, config, ... }
        // not { state }. Seats are on entry.table.seats, IDs on seat.player.id.
        if (!entry?.table?.seats) continue;

        const seatedPlayers = entry.table.seats
          .filter(s => s && s.player?.id)
          .map(s => ({ playerId: s.player.id, seatIndex: s.seatIndex, stack: s.stack }));

        if (seatedPlayers.length < 2) continue; // Need 2+ players for violations

        const settings = entry.config?.clubSettings || {};
        const clubId = entry.config?.clubId;

        tablesScanned++;

        // ─── CHECK 1: GPS Proximity ───────────────────────────
        if (settings.gps_restriction) {
          const gpsViolations = this._scanGPSProximity(tableId, seatedPlayers, settings);
          for (const v of gpsViolations) {
            await this._autoBoot(tableId, clubId, v.playerId, v.seatIndex, v.stack,
              'gps_proximity', v.reason, v.severity);
            violationsFound++;
          }
        }

        // ─── CHECK 2: Downline Limits ─────────────────────────
        if (settings.same_agent_downline_limit > 0) {
          const dlViolations = await this._scanDownlineLimits(tableId, seatedPlayers, settings, clubId);
          for (const v of dlViolations) {
            await this._autoBoot(tableId, clubId, v.playerId, v.seatIndex, v.stack,
              'downline_limit', v.reason, 'high');
            violationsFound++;
          }
        }

        // ─── CHECK 3: IP Conflicts ────────────────────────────
        if (settings.ip_restriction) {
          const ipViolations = this._scanIPConflicts(tableId, seatedPlayers);
          for (const v of ipViolations) {
            await this._autoBoot(tableId, clubId, v.playerId, v.seatIndex, v.stack,
              'ip_conflict', v.reason, 'high');
            violationsFound++;
          }
        }

        // ─── CHECK 4: Bot Patterns ────────────────────────────
        const botViolations = this._scanBotPatterns(seatedPlayers);
        for (const v of botViolations) {
          await this._autoBoot(tableId, clubId, v.playerId, v.seatIndex, v.stack,
            'bot_pattern', v.reason, 'critical');
          violationsFound++;
        }

        // ─── CHECK 5: Collusion Patterns ──────────────────────
        const collusionViolations = this._scanCollusionPatterns(tableId, seatedPlayers);
        for (const v of collusionViolations) {
          await this._autoBoot(tableId, clubId, v.playerId, v.seatIndex, v.stack,
            'collusion', v.reason, 'critical');
          violationsFound++;
        }
      }

      if (violationsFound > 0) {
        console.debug(`[AntiCheatMonitor] Scan complete: ${tablesScanned} tables, ${violationsFound} violations → auto-booted`);
      }
    } catch (err) {
      console.warn('[AntiCheatMonitor] Scan error:', err.message);
    } finally {
      this._running = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTO-BOOT — Force remove player, unlock chips, log everything
  // ═══════════════════════════════════════════════════════════════

  async _autoBoot(tableId, clubId, playerId, seatIndex, stack, flagType, reason, severity) {
    const key = `${playerId}:${tableId}`;

    // Cooldown — don't re-boot the same player at the same table within 60s
    const lastBoot = this._bootLog.get(key);
    if (lastBoot && Date.now() - lastBoot < BOOT_COOLDOWN_MS) return;
    this._bootLog.set(key, Date.now());

    console.warn(`[AntiCheatMonitor] 🚫 AUTO-BOOT: ${playerId} from table ${tableId} — ${reason}`);

    try {
      // 1. Force stand-up in engine
      const standResult = await this.controller.standUp(tableId, playerId);
      const cashoutAmount = standResult?.cashout ?? stack ?? 0;

      // 2. Unlock chips back to balance
      if (clubId && cashoutAmount > 0) {
        await ChipBridge.unlockChips(clubId, playerId, tableId, cashoutAmount)
          .catch(err => console.warn('[AntiCheatMonitor] Chip unlock failed:', err.message));
      }

      // 3. Clean up anti-cheat tracking
      this.antiCheat.removePlayerFromTable(playerId, tableId);
      this.antiCheat.closeSession(tableId, playerId, `auto-boot: ${reason}`)
        .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

      // 4. Log flag to database
      if (this.supabase) {
        await this.supabase.from('anti_cheat_flags').insert({
          player_id: playerId,
          club_id: clubId,
          table_id: tableId,
          flag_type: flagType,
          reason: `[AUTO-BOOT] ${reason}`,
          severity,
          status: 'actioned',
        }).then(({ error }) => { if (error) throw error; }).catch(err => console.warn('[AntiCheatMonitor] Flag insert failed:', err.message));

        // 5. Log event
        await this.supabase.from('anti_cheat_events').insert({
          event_type: 'player_kicked',
          player_id: playerId,
          club_id: clubId,
          table_id: tableId,
          details: { reason, severity, flagType, cashoutAmount, automated: true },
          triggered_by: 'anti_cheat_monitor',
        }).then(({ error }) => { if (error) throw error; }).catch(err => console.warn('[AntiCheatMonitor] Event insert failed:', err.message));
      }
    } catch (err) {
      console.warn(`[AntiCheatMonitor] Auto-boot failed for ${playerId}:`, err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 1: GPS PROXIMITY
  // Compare all pairs of seated players for distance violations
  // ═══════════════════════════════════════════════════════════════

  _scanGPSProximity(tableId, seatedPlayers, settings) {
    const violations = [];
    const minDistance = settings.gps_min_distance_meters || 100;
    const locations = this.antiCheat._playerLocations || new Map();
    const tableLocations = this.antiCheat._tableLocations || new Map();

    // Build location map for this table's players
    const playerLocs = [];
    for (const p of seatedPlayers) {
      // Check both player-level and table-level location stores
      const tKey = `${tableId}:${p.playerId}`;
      const loc = tableLocations.get(tKey) || locations.get(p.playerId);
      if (loc && loc.lat && loc.lng) {
        // Skip stale GPS data
        if (loc.timestamp && Date.now() - loc.timestamp > GPS_STALE_MS) continue;
        playerLocs.push({ ...p, lat: loc.lat, lng: loc.lng });
      }
    }

    // Check all pairs
    for (let i = 0; i < playerLocs.length; i++) {
      for (let j = i + 1; j < playerLocs.length; j++) {
        const a = playerLocs[i];
        const b = playerLocs[j];
        const dist = this._haversineDistance(a.lat, a.lng, b.lat, b.lng);

        if (dist < 50) {
          // < 50m = same room — boot the player who joined later (higher seat index as proxy)
          const target = a.seatIndex > b.seatIndex ? a : b;
          violations.push({
            playerId: target.playerId,
            seatIndex: target.seatIndex,
            stack: target.stack,
            reason: `GPS proximity violation: ${Math.round(dist)}m from another player (min: ${minDistance}m)`,
            severity: 'critical',
          });
        } else if (dist < minDistance) {
          // < configured minimum — boot the later joiner
          const target = a.seatIndex > b.seatIndex ? a : b;
          violations.push({
            playerId: target.playerId,
            seatIndex: target.seatIndex,
            stack: target.stack,
            reason: `GPS proximity warning: ${Math.round(dist)}m from another player (min: ${minDistance}m)`,
            severity: 'high',
          });
        }
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 2: DOWNLINE LIMITS
  // Re-verify agent chain for all seated players
  // ═══════════════════════════════════════════════════════════════

  async _scanDownlineLimits(tableId, seatedPlayers, settings, clubId) {
    const violations = [];
    const limit = settings.same_agent_downline_limit;
    if (!limit || limit <= 0 || !this.supabase) return violations;

    // Get agent for each seated player
    const agentMap = new Map(); // agentId → [players]
    for (const p of seatedPlayers) {
      try {
        const chain = await this.antiCheat._getPlayerAgentChain(p.playerId);
        if (chain?.agentId) {
          if (!agentMap.has(chain.agentId)) agentMap.set(chain.agentId, []);
          agentMap.get(chain.agentId).push(p);

          // Also check parent chain
          if (chain.parentChain) {
            for (const parentId of chain.parentChain) {
              if (!agentMap.has(parentId)) agentMap.set(parentId, []);
              agentMap.get(parentId).push(p);
            }
          }
        }
      } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    }

    // Check each agent's player count at this table
    for (const [agentId, players] of agentMap) {
      if (players.length > limit) {
        // Boot excess players (keep the ones who sat first = lower seat index)
        const sorted = players.sort((a, b) => a.seatIndex - b.seatIndex);
        const excess = sorted.slice(limit);
        for (const p of excess) {
          violations.push({
            playerId: p.playerId,
            seatIndex: p.seatIndex,
            stack: p.stack,
            reason: `Downline limit exceeded: ${players.length} players from agent ${agentId.slice(0, 8)}... (limit: ${limit})`,
          });
        }
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 3: IP CONFLICTS
  // Detect players sharing IPs at the same table
  // ═══════════════════════════════════════════════════════════════

  _scanIPConflicts(tableId, seatedPlayers) {
    const violations = [];
    const tableIPs = this.antiCheat._tableIPs || new Map();
    const seatedIds = new Set(seatedPlayers.map(p => p.playerId));
    const playerMap = new Map(seatedPlayers.map(p => [p.playerId, p]));

    // _tableIPs is `${tableId}:${ip}` → Set<playerId>
    // Find any IP key for this table with >1 seated player
    for (const [key, playerIds] of tableIPs) {
      if (!key.startsWith(`${tableId}:`)) continue;

      // Filter to only currently seated players
      const seatedWithIP = [...playerIds].filter(id => seatedIds.has(id));
      if (seatedWithIP.length > 1) {
        // Boot the player who joined later (higher seat index)
        const sorted = seatedWithIP
          .map(id => playerMap.get(id))
          .filter(Boolean)
          .sort((a, b) => a.seatIndex - b.seatIndex);

        const target = sorted[sorted.length - 1];
        const ip = key.split(':').slice(1).join(':'); // Handle IPv6
        violations.push({
          playerId: target.playerId,
          seatIndex: target.seatIndex,
          stack: target.stack,
          reason: `IP conflict: ${seatedWithIP.length} players sharing same IP at this table`,
        });
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 4: BOT PATTERNS
  // Analyze accumulated timing data for robotic behavior
  // ═══════════════════════════════════════════════════════════════

  _scanBotPatterns(seatedPlayers) {
    const violations = [];

    for (const p of seatedPlayers) {
      const result = this.antiCheat.analyzeBotPattern?.(p.playerId);
      if (result?.suspicious && result.confidence > 0.8) {
        violations.push({
          playerId: p.playerId,
          seatIndex: p.seatIndex,
          stack: p.stack,
          reason: `Bot pattern detected: ${result.reasons?.join(', ') || 'abnormal timing patterns'} (confidence: ${Math.round(result.confidence * 100)}%)`,
        });
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 5: COLLUSION PATTERNS
  // Detect coordinated play between seated players
  // ═══════════════════════════════════════════════════════════════

  _scanCollusionPatterns(tableId, seatedPlayers) {
    const violations = [];
    const collusionData = this.antiCheat._collusionData || new Map();

    // Check all player pairs at this table
    for (let i = 0; i < seatedPlayers.length; i++) {
      for (let j = i + 1; j < seatedPlayers.length; j++) {
        const a = seatedPlayers[i].playerId;
        const b = seatedPlayers[j].playerId;

        // Check both directions
        const keyAB = `${a}:${b}`;
        const keyBA = `${b}:${a}`;
        const dataAB = collusionData.get(keyAB) || { folds: 0, total: 0 };
        const dataBA = collusionData.get(keyBA) || { folds: 0, total: 0 };

        const totalHands = dataAB.total + dataBA.total;
        const totalFolds = dataAB.folds + dataBA.folds;

        // Need at least 20 hands of data, and >80% fold-to pattern = suspicious
        if (totalHands >= 20 && totalFolds / totalHands > 0.8) {
          // Boot both players
          violations.push({
            playerId: seatedPlayers[i].playerId,
            seatIndex: seatedPlayers[i].seatIndex,
            stack: seatedPlayers[i].stack,
            reason: `Collusion detected: ${Math.round(totalFolds / totalHands * 100)}% fold-to rate with player ${b.slice(0, 8)}... over ${totalHands} hands`,
          });
          violations.push({
            playerId: seatedPlayers[j].playerId,
            seatIndex: seatedPlayers[j].seatIndex,
            stack: seatedPlayers[j].stack,
            reason: `Collusion detected: ${Math.round(totalFolds / totalHands * 100)}% fold-to rate with player ${a.slice(0, 8)}... over ${totalHands} hands`,
          });
        }
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════════════════════════
  // HAVERSINE DISTANCE (meters)
  // ═══════════════════════════════════════════════════════════════

  _haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ═══════════════════════════════════════════════════════════════
  // UPDATE GPS — Called from heartbeat to keep location fresh
  // ═══════════════════════════════════════════════════════════════

  updatePlayerGPS(playerId, tableId, lat, lng) {
    if (lat == null || lng == null) return;

    // Update both stores so both preJoinCheck and monitor can see it
    if (this.antiCheat._playerLocations) {
      this.antiCheat._playerLocations.set(playerId, { lat, lng, timestamp: Date.now() });
    }
    if (this.antiCheat._tableLocations) {
      this.antiCheat._tableLocations.set(`${tableId}:${playerId}`, { lat, lng, timestamp: Date.now() });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP — Prune stale boot log entries
  // ═══════════════════════════════════════════════════════════════

  cleanup() {
    const now = Date.now();
    for (const [key, ts] of this._bootLog) {
      if (now - ts > BOOT_COOLDOWN_MS * 5) this._bootLog.delete(key);
    }
  }
}

module.exports = { AntiCheatMonitor };
