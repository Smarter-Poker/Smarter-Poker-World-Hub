/**
 * HEALTH WATCHDOG - Autonomous System Health Monitor
 * ===================================================================
 *
 * Self-monitoring loop that ensures 100% uptime with zero human intervention.
 * Runs independently of the Horse AI pipeline, checking system health every 15s.
 */

const { probeHealth, getHealth: getResilienceHealth } = require('./SupabaseResilience');

// ===================================================================
// CONFIGURATION
// ===================================================================

const WATCHDOG_INTERVAL_MS = 15000;
const HAND_STUCK_THRESHOLD_MS = 180000;
const TIMER_DEAD_THRESHOLD_MS = 120000;
const MEMORY_WARNING_PERCENT = 80;
const MEMORY_CRITICAL_PERCENT = 90;
const EVENT_LOOP_LAG_WARN_MS = 100;
const EVENT_LOOP_LAG_CRITICAL_MS = 500;
const SUPABASE_LATENCY_WARN_MS = 2000;
const MAX_HEALTH_LOG_ENTRIES = 100;

class HealthWatchdog {
  constructor(options = {}) {
    this.gameController = options.gameController || null;
    this.supabase = options.supabase || null;
    this.lobby = options.lobby || null;

    this._interval = null;
    this._running = false;
    this._healthLog = [];

    this._handProgress = new Map();
    this._timerHealth = new Map();

    this._lastLoopCheck = Date.now();
    this._eventLoopLag = 0;

    this._healingActions = [];
    this._totalHealingActions = 0;

    this._status = 'idle';
    this._lastCheckTime = 0;
    this._consecutiveHealthy = 0;
    this._consecutiveUnhealthy = 0;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._status = 'running';

    this._runHealthCheck().catch(err => {
      console.warn('[HealthWatchdog] Initial check failed:', err.message);
    });

    this._interval = setInterval(() => {
      this._runHealthCheck().catch(err => {
        console.warn('[HealthWatchdog] Health check failed:', err.message);
      });
    }, WATCHDOG_INTERVAL_MS);

    console.debug(`[HealthWatchdog] Started - checking every ${WATCHDOG_INTERVAL_MS / 1000}s`);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._running = false;
    this._status = 'stopped';
    console.debug('[HealthWatchdog] Stopped');
  }

  getStatus() {
    return {
      status: this._status,
      running: this._running,
      lastCheckTime: this._lastCheckTime,
      consecutiveHealthy: this._consecutiveHealthy,
      consecutiveUnhealthy: this._consecutiveUnhealthy,
      eventLoopLagMs: this._eventLoopLag,
      totalHealingActions: this._totalHealingActions,
      recentHealingActions: this._healingActions.slice(-10),
      resilience: getResilienceHealth(),
      recentHealth: this._healthLog.slice(-5),
    };
  }

  async _runHealthCheck() {
    const checkStart = Date.now();
    const issues = [];
    const healingPerformed = [];

    try {
      this._measureEventLoopLag();
      if (this._eventLoopLag > EVENT_LOOP_LAG_CRITICAL_MS) {
        issues.push({ system: 'eventLoop', severity: 'critical', detail: `Event loop lag: ${this._eventLoopLag}ms` });
      } else if (this._eventLoopLag > EVENT_LOOP_LAG_WARN_MS) {
        issues.push({ system: 'eventLoop', severity: 'warning', detail: `Event loop lag: ${this._eventLoopLag}ms` });
      }

      const memCheck = this._checkMemory();
      if (memCheck) issues.push(memCheck);

      const dbCheck = await this._checkSupabase();
      if (dbCheck) issues.push(dbCheck);

      const handIssues = this._checkActiveHands();
      issues.push(...handIssues);

      const timerIssues = this._checkTimerHealth();
      issues.push(...timerIssues);

      for (const issue of issues) {
        if (issue.severity === 'critical' && issue.healAction) {
          try {
            await issue.healAction();
            healingPerformed.push({
              time: Date.now(),
              system: issue.system,
              detail: issue.detail,
              action: issue.healDescription || 'auto-heal',
            });
            this._totalHealingActions++;
          } catch (err) {
            console.warn(`[HealthWatchdog] Healing failed for ${issue.system}:`, err.message);
          }
        }
      }

      if (healingPerformed.length > 0) {
        this._healingActions.push(...healingPerformed);
        if (this._healingActions.length > 50) {
          this._healingActions = this._healingActions.slice(-50);
        }
      }

    } catch (err) {
      issues.push({ system: 'watchdog', severity: 'critical', detail: `Check error: ${err.message}` });
    }

    const checkDuration = Date.now() - checkStart;
    this._lastCheckTime = checkStart;

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    if (criticalCount > 0) {
      this._status = 'degraded';
      this._consecutiveUnhealthy++;
      this._consecutiveHealthy = 0;
    } else if (warningCount > 0) {
      this._status = 'warning';
      this._consecutiveHealthy++;
      this._consecutiveUnhealthy = 0;
    } else {
      this._status = 'healthy';
      this._consecutiveHealthy++;
      this._consecutiveUnhealthy = 0;
    }

    const snapshot = {
      time: checkStart,
      durationMs: checkDuration,
      status: this._status,
      issues: issues.map(i => ({ system: i.system, severity: i.severity, detail: i.detail })),
      healingActions: healingPerformed.length,
    };
    this._healthLog.push(snapshot);
    if (this._healthLog.length > MAX_HEALTH_LOG_ENTRIES) {
      this._healthLog = this._healthLog.slice(-MAX_HEALTH_LOG_ENTRIES);
    }

    if (criticalCount > 0 || warningCount > 0) {
      const summary = issues.map(i => `[${i.severity}] ${i.system}: ${i.detail}`).join('; ');
      console.warn(`[HealthWatchdog] ${this._status.toUpperCase()} - ${summary}${healingPerformed.length > 0 ? ` (${healingPerformed.length} auto-healed)` : ''}`);
    }
  }

  _measureEventLoopLag() {
    const now = Date.now();
    const expectedDelta = WATCHDOG_INTERVAL_MS;
    const actualDelta = now - this._lastLoopCheck;
    this._eventLoopLag = Math.max(0, actualDelta - expectedDelta);
    this._lastLoopCheck = now;
  }

  _checkMemory() {
    if (typeof process === 'undefined') {
      return null;
    }
    // Guard against Edge Runtime where process.memoryUsage may not exist or throw
    let mem;
    try {
      const memUsageFn = process && process['memoryUsage'];
      if (typeof memUsageFn !== 'function') {
        return null;
      }
      mem = memUsageFn.call(process);
    } catch (e) {
      return null;
    }
    if (!mem || typeof mem.heapUsed !== 'number' || typeof mem.heapTotal !== 'number') {
      return null;
    }
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const percent = (mem.heapUsed / mem.heapTotal) * 100;

    if (percent > MEMORY_CRITICAL_PERCENT) {
      return {
        system: 'memory',
        severity: 'critical',
        detail: `Heap ${heapUsedMB}/${heapTotalMB}MB (${percent.toFixed(1)}%)`,
        healAction: async () => {
          if (global.gc) {
            global.gc();
            console.debug('[HealthWatchdog] Forced garbage collection');
          }
          this._clearNonCriticalCaches();
        },
        healDescription: 'Force GC + clear caches',
      };
    }

    if (percent > MEMORY_WARNING_PERCENT) {
      return {
        system: 'memory',
        severity: 'warning',
        detail: `Heap ${heapUsedMB}/${heapTotalMB}MB (${percent.toFixed(1)}%)`,
      };
    }

    return null;
  }

  async _checkSupabase() {
    if (!this.supabase) return null;

    const probe = await probeHealth(this.supabase);

    if (!probe.healthy) {
      return {
        system: 'supabase',
        severity: 'critical',
        detail: `Connection failed: ${probe.error} (${probe.latencyMs}ms)`,
      };
    }

    if (probe.latencyMs > SUPABASE_LATENCY_WARN_MS) {
      return {
        system: 'supabase',
        severity: 'warning',
        detail: `High latency: ${probe.latencyMs}ms`,
      };
    }

    return null;
  }

  _checkActiveHands() {
    const issues = [];
    if (!this.lobby) return issues;

    const now = Date.now();

    for (const [tableId, entry] of this.lobby.tables.entries()) {
      const table = entry.table;
      const game = table?.game;

      if (!game || !game.currentHand) {
        this._handProgress.delete(tableId);
        continue;
      }

      const handKey = `${game.currentHand.handNumber}:${game.phase}`;
      const existing = this._handProgress.get(tableId);

      if (existing && existing.handKey === handKey) {
        const stuckDuration = now - existing.lastProgressTime;

        if (stuckDuration > HAND_STUCK_THRESHOLD_MS) {
          const currentPlayer = game.bettingRound?.getCurrentPlayer();
          issues.push({
            system: 'stuckHand',
            severity: 'critical',
            detail: `Table ${tableId.substring(0, 8)}: hand #${game.currentHand.handNumber} stuck at ${game.phase} for ${Math.round(stuckDuration / 1000)}s. Current player: ${currentPlayer?.id?.substring(0, 8) || 'none'}`,
            healAction: async () => {
              if (currentPlayer) {
                console.warn(`[HealthWatchdog] Force-folding ${currentPlayer.id.substring(0, 8)} to unstick hand on ${tableId.substring(0, 8)}`);
                try {
                  table.processAction(String(currentPlayer.id), { type: 'fold' });
                } catch (e) {
                  console.warn(`[HealthWatchdog] Force-fold failed:`, e.message);
                }
              }
            },
            healDescription: 'Force-fold stuck player',
          });
        }
      } else {
        this._handProgress.set(tableId, {
          handKey,
          lastProgressTime: now,
          handNumber: game.currentHand.handNumber,
          phase: game.phase,
        });
      }
    }

    for (const tableId of this._handProgress.keys()) {
      if (!this.lobby.tables.has(tableId)) {
        this._handProgress.delete(tableId);
      }
    }

    return issues;
  }

  _checkTimerHealth() {
    const issues = [];
    if (!this.lobby) return issues;

    const now = Date.now();

    for (const [tableId, entry] of this.lobby.tables.entries()) {
      const table = entry.table;
      const game = table?.game;
      const timer = entry.timer;

      if (!game?.bettingRound || !game.bettingRound.getCurrentPlayer()) continue;
      if (!timer) continue;

      const existing = this._timerHealth.get(tableId);
      const timerActive = timer._turnTimer !== null || timer._running;

      if (!timerActive) {
        if (existing && (now - existing.lastActiveTime) > TIMER_DEAD_THRESHOLD_MS) {
          issues.push({
            system: 'deadTimer',
            severity: 'critical',
            detail: `Table ${tableId.substring(0, 8)}: timer dead for ${Math.round((now - existing.lastActiveTime) / 1000)}s while hand active`,
            healAction: async () => {
              const currentPlayer = game.bettingRound.getCurrentPlayer();
              if (currentPlayer && timer.startTurn) {
                console.warn(`[HealthWatchdog] Restarting timer for ${currentPlayer.id.substring(0, 8)} on ${tableId.substring(0, 8)}`);
                try {
                  timer.startTurn(String(currentPlayer.id));
                } catch (e) {
                  console.warn(`[HealthWatchdog] Timer restart failed:`, e.message);
                }
              }
            },
            healDescription: 'Restart dead timer',
          });
        }
      } else {
        this._timerHealth.set(tableId, { lastActiveTime: now });
      }
    }

    for (const tableId of this._timerHealth.keys()) {
      if (!this.lobby.tables.has(tableId)) {
        this._timerHealth.delete(tableId);
      }
    }

    return issues;
  }

  _clearNonCriticalCaches() {
    try {
      if (this._healthLog.length > 10) {
        this._healthLog = this._healthLog.slice(-10);
      }
      if (this._healingActions.length > 10) {
        this._healingActions = this._healingActions.slice(-10);
      }
    } catch (e) {
      // ignore
    }
  }
}

module.exports = HealthWatchdog;
module.exports.HealthWatchdog = HealthWatchdog;