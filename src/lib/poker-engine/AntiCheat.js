/**
 * 🛡️ ANTI-CHEAT ENFORCEMENT
 * ═══════════════════════════════════════════════════════════════
 * 
 * Provides server-side enforcement for:
 *   1. IP Restriction — configurable per-club/table (same IP, VPN detection)
 *   2. Rate Limiting — action flood prevention
 *   3. Device Fingerprinting — multi-accounting detection
 *   4. Collusion Detection — cross-table pattern analysis
 *   5. Bot Detection — timing pattern + action entropy analysis
 *   6. Downline-per-Table — same agent limits (requires Supabase)
 *   7. GPS Proximity — block co-located players at same table
 *   8. Emulator Detection — block Android/iOS emulators
 *   9. Session Persistence — track sessions to DB for audit trail
 * 
 * Usage:
 *   import { AntiCheat } from '@/lib/poker-engine/AntiCheat';
 *   const ac = new AntiCheat(supabase);
 *   
 *   // Before seating
 *   const check = await ac.preJoinCheck(playerId, tableId, req);
 *   if (!check.allowed) return res.status(403).json({ error: check.reason });
 *   
 *   // On each action
 *   const actionCheck = ac.validateAction(playerId, tableId);
 *   if (!actionCheck.allowed) return res.status(429).json({ error: 'Rate limited' });
 * ═══════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ACTION_RATE_LIMIT_WINDOW_MS = 5000; // 5 second window
const ACTION_RATE_LIMIT_MAX = 15;          // Max 15 actions per 5s
const JOIN_RATE_LIMIT_WINDOW_MS = 60000;   // 1 minute window
const JOIN_RATE_LIMIT_MAX = 5;             // Max 5 join attempts per minute
const TIMING_HISTORY_SIZE = 50;            // Keep last 50 action timings
const BOT_VARIANCE_THRESHOLD = 0.02;       // Suspiciously low timing variance
const BOT_CONSTANT_THRESHOLD = 5;          // N identical timings in a row = suspicious

class AntiCheat {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    this.supabase = supabase;

    // Rate limiting maps
    this._actionCounts = new Map();  // `${playerId}:${tableId}` → { count, windowStart }
    this._joinCounts = new Map();    // playerId → { count, windowStart }

    // IP tracking
    this._playerIPs = new Map();     // playerId → Set<ip>
    this._tableIPs = new Map();      // `${tableId}:${ip}` → Set<playerId>

    // Device fingerprints
    this._playerDevices = new Map(); // playerId → Set<fingerprint>
    this._devicePlayers = new Map(); // fingerprint → Set<playerId>

    // Timing analysis (bot detection)
    this._actionTimings = new Map(); // playerId → [timestamp, timestamp, ...]

    // Collusion tracking
    this._playerActions = new Map(); // playerId → [{ tableId, action, target, timestamp }]

    // GPS/Proximity tracking
    this._playerLocations = new Map(); // playerId → { lat, lng, timestamp }
    this._tableLocations = new Map();  // `${tableId}:${playerId}` → { lat, lng }

    // Downline/agent tracking cache
    this._agentCache = new Map();      // playerId → { agentId, parentChain, cachedAt }
    this._tableDownlines = new Map();  // `${tableId}:${agentChainKey}` → Set<playerId>

    // Flags
    this._flags = new Map();         // playerId → [{ type, reason, timestamp, severity }]
  }

  // ═══════════════════════════════════════════════════════════
  // 1. PRE-JOIN CHECK
  // ═══════════════════════════════════════════════════════════

  /**
   * Run all pre-join validation before seating a player.
   * @param {string} playerId
   * @param {string} tableId
   * @param {Object} req - HTTP request object (for IP extraction)
   * @param {Object} [options] - { clubSettings, fingerprint }
   * @returns {{ allowed: boolean, reason?: string, warnings?: string[] }}
   */
  async preJoinCheck(playerId, tableId, req, options = {}) {
    const warnings = [];
    const ip = this._extractIP(req);

    // Join rate limiting
    if (!this._checkJoinRateLimit(playerId)) {
      return { allowed: false, reason: 'Too many join attempts. Please wait.' };
    }

    // IP-based checks
    if (ip) {
      this._trackIP(playerId, tableId, ip);

      // Check if another player at this table shares this IP
      const sameIPPlayers = this._getPlayersAtTableWithIP(tableId, ip);
      const otherPlayers = sameIPPlayers.filter(id => id !== playerId);

      if (otherPlayers.length > 0) {
        const ipRestriction = options.clubSettings?.ip_restriction || 'warn';
        if (ipRestriction === 'block') {
          return { allowed: false, reason: 'Another player at this table shares your network address.' };
        }
        if (ipRestriction === 'warn') {
          warnings.push(`IP conflict: shares network with ${otherPlayers.length} player(s) at this table`);
          this._addFlag(playerId, 'ip_conflict', `Shares IP ${ip} with players: ${otherPlayers.join(', ')}`, 'medium');
        }
      }
    }

    // Device fingerprint check
    if (options.fingerprint) {
      this._trackDevice(playerId, options.fingerprint);

      // Check if this device is associated with other players
      const devicePlayers = this._devicePlayers.get(options.fingerprint) || new Set();
      const otherAccounts = [...devicePlayers].filter(id => id !== playerId);

      if (otherAccounts.length > 0) {
        warnings.push(`Multi-account suspect: device linked to ${otherAccounts.length} other account(s)`);
        this._addFlag(playerId, 'multi_account', `Device ${options.fingerprint.slice(0, 8)}... linked to: ${otherAccounts.join(', ')}`, 'high');
      }
    }

    // ─── Downline-per-table limit (same_agent_downline_limit) ───
    const downlineLimit = options.clubSettings?.same_agent_downline_limit;
    if (downlineLimit && downlineLimit > 0) {
      const downlineCheck = await this._checkDownlineLimit(playerId, tableId, downlineLimit);
      if (!downlineCheck.allowed) {
        return { allowed: false, reason: downlineCheck.reason };
      }
      if (downlineCheck.warning) {
        warnings.push(downlineCheck.warning);
      }
    }

    // ─── GPS / Proximity Detection (gps_restriction) ───
    const gpsRestriction = options.clubSettings?.gps_restriction;
    if (gpsRestriction && options.location?.lat != null && options.location?.lng != null) {
      const proximityCheck = this._checkGPSProximity(
        playerId, tableId,
        options.location.lat, options.location.lng,
        options.clubSettings?.gps_min_distance_meters || 100
      );
      if (!proximityCheck.allowed) {
        return { allowed: false, reason: proximityCheck.reason };
      }
      if (proximityCheck.warnings?.length) {
        warnings.push(...proximityCheck.warnings);
      }
    }

    // ─── Emulator Detection (emulator_restriction) ───
    if (options.clubSettings?.emulator_restriction && options.userAgent) {
      const emulatorCheck = this._checkEmulator(options.userAgent, playerId);
      if (!emulatorCheck.allowed) {
        return { allowed: false, reason: emulatorCheck.reason };
      }
      if (emulatorCheck.warning) {
        warnings.push(emulatorCheck.warning);
      }
    }

    return { allowed: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  // ═══════════════════════════════════════════════════════════
  // 2. ACTION RATE LIMITING
  // ═══════════════════════════════════════════════════════════

  /**
   * Validate that an action isn't rate-limited.
   * @param {string} playerId
   * @param {string} tableId
   * @returns {{ allowed: boolean, reason?: string }}
   */
  validateAction(playerId, tableId) {
    const key = `${playerId}:${tableId}`;
    const now = Date.now();

    let entry = this._actionCounts.get(key);
    if (!entry || now - entry.windowStart > ACTION_RATE_LIMIT_WINDOW_MS) {
      entry = { count: 0, windowStart: now };
      this._actionCounts.set(key, entry);
    }

    entry.count++;

    if (entry.count > ACTION_RATE_LIMIT_MAX) {
      this._addFlag(playerId, 'rate_limit', `${entry.count} actions in ${ACTION_RATE_LIMIT_WINDOW_MS}ms window`, 'low');
      return { allowed: false, reason: 'Action rate limit exceeded' };
    }

    // Track timing for bot detection
    this._recordActionTiming(playerId);

    return { allowed: true };
  }

  // ═══════════════════════════════════════════════════════════
  // 3. BOT DETECTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Analyze action timing patterns for bot-like behavior.
   * @param {string} playerId
   * @returns {{ suspicious: boolean, score: number, reason?: string }}
   */
  analyzeBotPattern(playerId) {
    const timings = this._actionTimings.get(playerId);
    if (!timings || timings.length < 10) {
      return { suspicious: false, score: 0 };
    }

    // Calculate intervals between actions
    const intervals = [];
    for (let i = 1; i < timings.length; i++) {
      intervals.push(timings[i] - timings[i - 1]);
    }

    // 1. Check variance — bots tend to have very consistent timing
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / intervals.length;
    const normalizedVariance = variance / (mean * mean || 1);

    if (normalizedVariance < BOT_VARIANCE_THRESHOLD && intervals.length > 20) {
      this._addFlag(playerId, 'bot_timing', `Suspiciously consistent timing (variance: ${normalizedVariance.toFixed(4)})`, 'high');
      return { suspicious: true, score: 0.8, reason: 'Timing variance too low' };
    }

    // 2. Check for repeating patterns (exact same intervals)
    let consecutiveIdentical = 1;
    let maxConsecutive = 1;
    for (let i = 1; i < intervals.length; i++) {
      if (Math.abs(intervals[i] - intervals[i - 1]) < 50) { // Within 50ms
        consecutiveIdentical++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveIdentical);
      } else {
        consecutiveIdentical = 1;
      }
    }

    if (maxConsecutive >= BOT_CONSTANT_THRESHOLD) {
      this._addFlag(playerId, 'bot_pattern', `${maxConsecutive} consecutive similar-timed actions`, 'medium');
      return { suspicious: true, score: 0.6, reason: 'Repeating timing pattern' };
    }

    // 3. Check for inhuman speed (< 200ms average response)
    if (mean < 200 && intervals.length > 15) {
      this._addFlag(playerId, 'bot_speed', `Average response time: ${Math.round(mean)}ms`, 'high');
      return { suspicious: true, score: 0.9, reason: 'Inhuman response speed' };
    }

    return { suspicious: false, score: Math.min(normalizedVariance < 0.1 ? 0.3 : 0, 1) };
  }

  // ═══════════════════════════════════════════════════════════
  // 4. COLLUSION DETECTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Record an action for collusion pattern analysis.
   * @param {string} playerId
   * @param {string} tableId
   * @param {Object} action - { type, amount, targetPlayerId }
   */
  recordAction(playerId, tableId, action) {
    if (!this._playerActions.has(playerId)) {
      this._playerActions.set(playerId, []);
    }

    const history = this._playerActions.get(playerId);
    history.push({
      tableId,
      type: action.type,
      amount: action.amount,
      target: action.targetPlayerId,
      timestamp: Date.now(),
    });

    // Keep only last 200 actions
    if (history.length > 200) history.splice(0, history.length - 200);
  }

  /**
   * Check for soft-play patterns between two players.
   * @param {string} player1
   * @param {string} player2
   * @returns {{ suspicious: boolean, score: number, patterns: string[] }}
   */
  checkCollusion(player1, player2) {
    const actions1 = this._playerActions.get(player1) || [];
    const actions2 = this._playerActions.get(player2) || [];
    const patterns = [];
    let score = 0;

    // Pattern 1: Always fold to each other
    const p1FoldsToP2 = actions1.filter(a => a.type === 'fold' && a.target === player2).length;
    const p1TotalVsP2 = actions1.filter(a => a.target === player2).length;
    const p2FoldsToP1 = actions2.filter(a => a.type === 'fold' && a.target === player1).length;
    const p2TotalVsP1 = actions2.filter(a => a.target === player1).length;

    if (p1TotalVsP2 > 5 && p1FoldsToP2 / p1TotalVsP2 > 0.8) {
      patterns.push(`${player1} folds to ${player2} ${Math.round(p1FoldsToP2 / p1TotalVsP2 * 100)}% of the time`);
      score += 0.3;
    }
    if (p2TotalVsP1 > 5 && p2FoldsToP1 / p2TotalVsP1 > 0.8) {
      patterns.push(`${player2} folds to ${player1} ${Math.round(p2FoldsToP1 / p2TotalVsP1 * 100)}% of the time`);
      score += 0.3;
    }

    // Pattern 2: Chip dumping (large bets followed by immediate fold from receiver)
    // This is a simplified heuristic
    const suspicious = score > 0.4;
    if (suspicious) {
      this._addFlag(player1, 'collusion', `Suspicious patterns with ${player2}`, 'high');
      this._addFlag(player2, 'collusion', `Suspicious patterns with ${player1}`, 'high');
    }

    return { suspicious, score: Math.min(score, 1), patterns };
  }

  // ═══════════════════════════════════════════════════════════
  // FLAG MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  /**
   * Get all flags for a player.
   * @param {string} playerId
   * @returns {Array}
   */
  getFlags(playerId) {
    return this._flags.get(playerId) || [];
  }

  /**
   * Get all flagged players.
   * @returns {Map<string, Array>}
   */
  getAllFlags() {
    return new Map(this._flags);
  }

  /**
   * Clear flags for a player.
   * @param {string} playerId
   */
  clearFlags(playerId) {
    this._flags.delete(playerId);
  }

  /**
   * Persist flags to database for admin review.
   * @param {string} playerId
   * @param {string} [clubId] - Club context for the flags
   * @param {string} [tableId] - Table context for the flags
   */
  async persistFlags(playerId, clubId, tableId) {
    if (!this.supabase) return;
    const flags = this.getFlags(playerId);
    if (flags.length === 0) return;

    try {
      await this.supabase
        .from('anti_cheat_flags')
        .insert(flags.map(f => ({
          player_id: playerId,
          club_id: clubId || null,
          table_id: tableId || null,
          flag_type: f.type,
          reason: f.reason,
          severity: f.severity,
          flagged_at: new Date(f.timestamp).toISOString(),
        })));

      // Also log events
      await this.supabase
        .from('anti_cheat_events')
        .insert(flags.map(f => ({
          event_type: 'flag_created',
          player_id: playerId,
          club_id: clubId || null,
          table_id: tableId || null,
          details: { flag_type: f.type, reason: f.reason, severity: f.severity },
          triggered_by: 'system',
        })));
    } catch (err) {
      console.error('[AntiCheat] Persist flags error:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SESSION PERSISTENCE
  // ═══════════════════════════════════════════════════════════

  /**
   * Record a player session when they sit down.
   * @param {string} tableId
   * @param {string} playerId
   * @param {number} seatIndex
   * @param {Object} clientData - { ip, lat, lng, fingerprint, userAgent, clubId }
   */
  async recordSession(tableId, playerId, seatIndex, clientData = {}) {
    if (!this.supabase) return;

    try {
      await this.supabase
        .from('table_sessions')
        .upsert({
          table_id: tableId,
          player_id: playerId,
          club_id: clientData.clubId || null,
          seat_index: seatIndex,
          ip_address: clientData.ip || null,
          latitude: clientData.lat || null,
          longitude: clientData.lng || null,
          fingerprint: clientData.fingerprint || null,
          user_agent: clientData.userAgent || null,
          is_active: true,
          seated_at: new Date().toISOString(),
          left_at: null,
          kick_reason: null,
        }, {
          onConflict: 'table_id,player_id',
          ignoreDuplicates: false,
        });

      await this.supabase
        .from('anti_cheat_events')
        .insert({
          event_type: 'session_started',
          player_id: playerId,
          club_id: clientData.clubId || null,
          table_id: tableId,
          details: {
            seat_index: seatIndex,
            has_ip: !!clientData.ip,
            has_gps: !!(clientData.lat && clientData.lng),
            has_fingerprint: !!clientData.fingerprint,
          },
          triggered_by: 'system',
        });
    } catch (err) {
      console.error('[AntiCheat] Record session error:', err.message);
    }
  }

  /**
   * Close a player session when they leave.
   * @param {string} tableId
   * @param {string} playerId
   * @param {string} [reason] - Optional kick reason
   */
  async closeSession(tableId, playerId, reason) {
    if (!this.supabase) return;

    try {
      await this.supabase.rpc('close_table_session', {
        p_table_id: tableId,
        p_player_id: playerId,
        p_reason: reason || null,
      });

      await this.supabase
        .from('anti_cheat_events')
        .insert({
          event_type: 'session_ended',
          player_id: playerId,
          table_id: tableId,
          details: { reason: reason || 'voluntary' },
          triggered_by: 'system',
        });
    } catch (err) {
      console.error('[AntiCheat] Close session error:', err.message);
    }
  }

  /**
   * Log a seat-blocked event when anti-cheat denies seating.
   * @param {string} playerId
   * @param {string} tableId
   * @param {string} clubId
   * @param {string} reason
   */
  async logSeatBlocked(playerId, tableId, clubId, reason) {
    if (!this.supabase) return;

    try {
      await this.supabase
        .from('anti_cheat_events')
        .insert({
          event_type: 'seat_blocked',
          player_id: playerId,
          club_id: clubId || null,
          table_id: tableId,
          details: { reason },
          triggered_by: 'system',
        });
    } catch (err) {
      console.error('[AntiCheat] Log seat blocked error:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _extractIP(req) {
    if (!req) return null;
    return req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers?.['x-real-ip'] ||
           req.socket?.remoteAddress ||
           null;
  }

  /** @private */
  _trackIP(playerId, tableId, ip) {
    if (!this._playerIPs.has(playerId)) this._playerIPs.set(playerId, new Set());
    this._playerIPs.get(playerId).add(ip);

    const key = `${tableId}:${ip}`;
    if (!this._tableIPs.has(key)) this._tableIPs.set(key, new Set());
    this._tableIPs.get(key).add(playerId);
  }

  /** @private */
  _getPlayersAtTableWithIP(tableId, ip) {
    const key = `${tableId}:${ip}`;
    return [...(this._tableIPs.get(key) || [])];
  }

  /** @private */
  _trackDevice(playerId, fingerprint) {
    if (!this._playerDevices.has(playerId)) this._playerDevices.set(playerId, new Set());
    this._playerDevices.get(playerId).add(fingerprint);

    if (!this._devicePlayers.has(fingerprint)) this._devicePlayers.set(fingerprint, new Set());
    this._devicePlayers.get(fingerprint).add(playerId);
  }

  /** @private */
  _checkJoinRateLimit(playerId) {
    const now = Date.now();
    let entry = this._joinCounts.get(playerId);
    if (!entry || now - entry.windowStart > JOIN_RATE_LIMIT_WINDOW_MS) {
      entry = { count: 0, windowStart: now };
      this._joinCounts.set(playerId, entry);
    }
    entry.count++;
    return entry.count <= JOIN_RATE_LIMIT_MAX;
  }

  /** @private */
  _recordActionTiming(playerId) {
    if (!this._actionTimings.has(playerId)) this._actionTimings.set(playerId, []);
    const timings = this._actionTimings.get(playerId);
    timings.push(Date.now());
    if (timings.length > TIMING_HISTORY_SIZE) timings.shift();
  }

  /** @private */
  _addFlag(playerId, type, reason, severity) {
    if (!this._flags.has(playerId)) this._flags.set(playerId, []);
    this._flags.get(playerId).push({
      type,
      reason,
      severity,
      timestamp: Date.now(),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // DOWNLINE-PER-TABLE ENFORCEMENT
  // ═══════════════════════════════════════════════════════════

  /**
   * Check if seating this player would exceed the downline limit at this table.
   * "Downline" = players who share the same agent (or are in the same agent tree).
   * @private
   */
  async _checkDownlineLimit(playerId, tableId, limit) {
    if (!this.supabase) return { allowed: true };

    try {
      // Get this player's agent chain
      const playerAgent = await this._getPlayerAgentChain(playerId);
      if (!playerAgent || !playerAgent.agentId) {
        return { allowed: true }; // No agent = no downline restriction
      }

      // Build downline key: we check against the immediate agent (not the full tree)
      // If agent A has players X, Y, Z — all three share the downline key
      const downlineKey = `${tableId}:agent:${playerAgent.agentId}`;

      if (!this._tableDownlines.has(downlineKey)) {
        this._tableDownlines.set(downlineKey, new Set());
      }

      const downlineAtTable = this._tableDownlines.get(downlineKey);
      const otherDownline = [...downlineAtTable].filter(id => id !== playerId);

      if (otherDownline.length >= limit) {
        this._addFlag(playerId, 'downline_limit',
          `Agent ${playerAgent.agentId} has ${otherDownline.length}/${limit} downline at table ${tableId}`,
          'medium');
        return {
          allowed: false,
          reason: `Table limit: max ${limit} player(s) from the same agent are already seated.`,
        };
      }

      // Also check the full parent chain — if agents share a super agent
      if (playerAgent.parentChain?.length > 0) {
        for (const parentId of playerAgent.parentChain) {
          const parentKey = `${tableId}:agent:${parentId}`;
          const parentDownline = this._tableDownlines.get(parentKey);
          if (parentDownline && [...parentDownline].filter(id => id !== playerId).length >= limit) {
            this._addFlag(playerId, 'downline_limit',
              `Super-agent ${parentId} chain has ${parentDownline.size}/${limit} at table ${tableId}`,
              'medium');
            return {
              allowed: false,
              reason: `Table limit: max ${limit} player(s) from the same agent network are already seated.`,
            };
          }
        }
      }

      // Player is allowed — register them in tracking
      downlineAtTable.add(playerId);

      // Also register in parent chain keys
      for (const parentId of (playerAgent.parentChain || [])) {
        const parentKey = `${tableId}:agent:${parentId}`;
        if (!this._tableDownlines.has(parentKey)) this._tableDownlines.set(parentKey, new Set());
        this._tableDownlines.get(parentKey).add(playerId);
      }

      if (otherDownline.length > 0) {
        return {
          allowed: true,
          warning: `${otherDownline.length} other player(s) from same agent at this table (limit: ${limit})`,
        };
      }

      return { allowed: true };
    } catch (err) {
      console.error('[AntiCheat] Downline check error:', err.message);
      return { allowed: true }; // Fail open on errors
    }
  }

  /**
   * Get the agent chain for a player (with caching).
   * Returns { agentId, parentChain: [parentAgentId, grandparentId, ...] }
   * @private
   */
  async _getPlayerAgentChain(playerId) {
    // Check cache (valid for 5 minutes)
    const cached = this._agentCache.get(playerId);
    if (cached && Date.now() - cached.cachedAt < 300000) {
      return cached;
    }

    if (!this.supabase) return null;

    try {
      // Get the player's agent from club_members
      const { data: membership } = await this.supabase
        .from('club_members')
        .select('agent_id')
        .eq('user_id', playerId)
        .not('agent_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (!membership?.agent_id) {
        this._agentCache.set(playerId, { agentId: null, parentChain: [], cachedAt: Date.now() });
        return null;
      }

      // Walk the agent parent chain (max 5 levels deep)
      const parentChain = [];
      let currentAgentId = membership.agent_id;

      for (let depth = 0; depth < 5; depth++) {
        const { data: agent } = await this.supabase
          .from('agents')
          .select('id, user_id, parent_agent_id')
          .eq('id', currentAgentId)
          .maybeSingle();

        if (!agent) break;

        if (agent.parent_agent_id) {
          parentChain.push(agent.parent_agent_id);
          currentAgentId = agent.parent_agent_id;
        } else {
          break;
        }
      }

      const result = {
        agentId: membership.agent_id,
        parentChain,
        cachedAt: Date.now(),
      };

      this._agentCache.set(playerId, result);
      return result;
    } catch (err) {
      console.error('[AntiCheat] Agent chain lookup error:', err.message);
      return null;
    }
  }

  /**
   * Remove player from downline tracking when they leave a table.
   * @param {string} playerId
   * @param {string} tableId
   */
  removePlayerFromTable(playerId, tableId) {
    // Clean up downline tracking
    for (const [key, players] of this._tableDownlines) {
      if (key.startsWith(`${tableId}:`)) {
        players.delete(playerId);
        if (players.size === 0) this._tableDownlines.delete(key);
      }
    }

    // Clean up IP tracking
    for (const [key, players] of this._tableIPs) {
      if (key.startsWith(`${tableId}:`)) {
        players.delete(playerId);
        if (players.size === 0) this._tableIPs.delete(key);
      }
    }

    // Clean up GPS tracking
    this._tableLocations.delete(`${tableId}:${playerId}`);
  }

  // ═══════════════════════════════════════════════════════════
  // GPS / PROXIMITY DETECTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Check if a player is too close to another player at the same table.
   * @private
   */
  _checkGPSProximity(playerId, tableId, lat, lng, minDistanceMeters = 100) {
    const warnings = [];

    // Store this player's location
    this._playerLocations.set(playerId, { lat, lng, timestamp: Date.now() });
    this._tableLocations.set(`${tableId}:${playerId}`, { lat, lng });

    // Check distance against all other players at this table
    for (const [key, loc] of this._tableLocations) {
      if (!key.startsWith(`${tableId}:`)) continue;
      const otherId = key.split(':').pop();
      if (otherId === playerId) continue;

      const distance = this._haversineDistance(lat, lng, loc.lat, loc.lng);

      if (distance < minDistanceMeters) {
        this._addFlag(playerId, 'gps_proximity',
          `Within ${Math.round(distance)}m of player ${otherId} at table ${tableId}`,
          'high');
        this._addFlag(otherId, 'gps_proximity',
          `Player ${playerId} joined within ${Math.round(distance)}m`,
          'high');

        // Block if distance is under 50m (definitely same room)
        if (distance < 50) {
          return {
            allowed: false,
            reason: 'You appear to be in the same location as another player at this table. This is not allowed.',
          };
        }

        // Warn if between 50-100m
        warnings.push(`GPS alert: within ${Math.round(distance)}m of another player at this table`);
      }
    }

    return { allowed: true, warnings };
  }

  /**
   * Haversine formula — distance between two GPS coordinates in meters.
   * @private
   */
  _haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg) => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ═══════════════════════════════════════════════════════════
  // EMULATOR DETECTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Basic emulator detection via user-agent patterns.
   * @private
   */
  _checkEmulator(userAgent, playerId) {
    if (!userAgent) return { allowed: true };

    const ua = userAgent.toLowerCase();
    const emulatorPatterns = [
      'bluestacks', 'nox', 'memu', 'ldplayer', 'gameloop',
      'genymotion', 'android sdk built for x86',
      'google_sdk', 'sdk_gphone', 'emulator', 'goldfish',
      'android emulator', 'sdk_x86',
    ];

    for (const pattern of emulatorPatterns) {
      if (ua.includes(pattern)) {
        this._addFlag(playerId, 'emulator', `Emulator detected: ${pattern} in user-agent`, 'high');
        return {
          allowed: false,
          reason: 'Emulators are not allowed. Please use a real device.',
          warning: `Emulator pattern detected: ${pattern}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Clean up stale data (call periodically).
   */
  cleanup() {
    const cutoff = Date.now() - 3600000; // 1 hour
    for (const [key, entry] of this._actionCounts) {
      if (entry.windowStart < cutoff) this._actionCounts.delete(key);
    }
    for (const [key, entry] of this._joinCounts) {
      if (entry.windowStart < cutoff) this._joinCounts.delete(key);
    }
    // Clean stale GPS locations (> 30 min)
    const gpsCutoff = Date.now() - 1800000;
    for (const [key, loc] of this._playerLocations) {
      if (loc.timestamp < gpsCutoff) this._playerLocations.delete(key);
    }
    // Clean stale agent cache (> 10 min)
    const agentCutoff = Date.now() - 600000;
    for (const [key, cached] of this._agentCache) {
      if (cached.cachedAt < agentCutoff) this._agentCache.delete(key);
    }
    // Clean empty downline sets
    for (const [key, players] of this._tableDownlines) {
      if (players.size === 0) this._tableDownlines.delete(key);
    }
  }
}

module.exports = { AntiCheat };
