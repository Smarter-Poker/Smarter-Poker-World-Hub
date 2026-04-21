/**
 * 🛡️ SUPABASE RESILIENCE LAYER — Zero-Downtime Database Operations
 * ═══════════════════════════════════════════════════════════════════
 *
 * Wraps all Supabase operations with:
 *   1. Exponential backoff retry (3 attempts, 200ms → 800ms → 3200ms)
 *   2. Circuit breaker (stops hammering Supabase when it's truly down)
 *   3. Connection health probe (periodic SELECT 1 to detect pool drops)
 *   4. Operation metrics (track success/failure rates for observability)
 *
 * Usage:
 *   const { resilientQuery, resilientMutation, getHealth } = require('./SupabaseResilience');
 *
 *   // Instead of: await supabase.from('tables').select('*')
 *   // Use:        await resilientQuery(supabase, () => supabase.from('tables').select('*'))
 *
 *   // For writes (upsert, insert, update, delete):
 *   // await resilientMutation(supabase, () => supabase.from('tables').update({...}).eq('id', id))
 *
 * The circuit breaker prevents thundering-herd failures:
 *   - After 5 consecutive failures → circuit OPEN (no queries for 30s)
 *   - After 30s → circuit HALF-OPEN (one probe query allowed)
 *   - If probe succeeds → circuit CLOSED (normal operation)
 *   - If probe fails → circuit stays OPEN (another 30s cooldown)
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
  backoffMultiplier: 4, // 200ms → 800ms → 3200ms
  jitterFactor: 0.25,   // ±25% jitter to prevent thundering herd
};

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,  // Consecutive failures before opening circuit
  resetTimeoutMs: 30000, // 30 seconds before trying again
  halfOpenMaxConcurrent: 1, // Only allow 1 probe in half-open state
};

// ═══════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER STATE
// ═══════════════════════════════════════════════════════════════════

const CIRCUIT_STATE = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Supabase is down, reject all queries
  HALF_OPEN: 'half_open', // Testing with a single query
};

let _circuitState = CIRCUIT_STATE.CLOSED;
let _consecutiveFailures = 0;
let _lastFailureTime = 0;
let _halfOpenInFlight = 0;

// ═══════════════════════════════════════════════════════════════════
// METRICS
// ═══════════════════════════════════════════════════════════════════

const _metrics = {
  totalQueries: 0,
  totalMutations: 0,
  successfulOps: 0,
  failedOps: 0,
  retriedOps: 0,
  circuitBreakerTrips: 0,
  totalRetryDelayMs: 0,
  lastSuccessTime: 0,
  lastFailureTime: 0,
  lastError: null,
};

/**
 * Get operation metrics for monitoring/observability.
 * @returns {Object} Copy of current metrics
 */
function getMetrics() {
  return {
    ..._metrics,
    circuitState: _circuitState,
    consecutiveFailures: _consecutiveFailures,
    uptimePercent: _metrics.totalQueries + _metrics.totalMutations > 0
      ? ((_metrics.successfulOps / (_metrics.totalQueries + _metrics.totalMutations)) * 100).toFixed(2) + '%'
      : 'N/A',
  };
}

// ═══════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER LOGIC
// ═══════════════════════════════════════════════════════════════════

function _checkCircuitBreaker() {
  if (_circuitState === CIRCUIT_STATE.CLOSED) {
    return true; // Allow
  }

  if (_circuitState === CIRCUIT_STATE.OPEN) {
    // Check if cooldown has elapsed
    const elapsed = Date.now() - _lastFailureTime;
    if (elapsed >= CIRCUIT_BREAKER_CONFIG.resetTimeoutMs) {
      // Transition to half-open
      _circuitState = CIRCUIT_STATE.HALF_OPEN;
      _halfOpenInFlight = 0;
      console.debug('[SupabaseResilience] Circuit breaker → HALF_OPEN (testing connection)');
      return true; // Allow one probe
    }
    return false; // Still in cooldown
  }

  if (_circuitState === CIRCUIT_STATE.HALF_OPEN) {
    // Only allow limited concurrent probes
    if (_halfOpenInFlight < CIRCUIT_BREAKER_CONFIG.halfOpenMaxConcurrent) {
      _halfOpenInFlight++;
      return true;
    }
    return false; // Already probing
  }

  return true;
}

function _onSuccess() {
  _consecutiveFailures = 0;
  _metrics.successfulOps++;
  _metrics.lastSuccessTime = Date.now();

  if (_circuitState === CIRCUIT_STATE.HALF_OPEN) {
    _circuitState = CIRCUIT_STATE.CLOSED;
    _halfOpenInFlight = 0;
    console.debug('[SupabaseResilience] Circuit breaker → CLOSED (connection restored)');
  }
}

function _onFailure(err) {
  _consecutiveFailures++;
  _metrics.failedOps++;
  _metrics.lastFailureTime = Date.now();
  _metrics.lastError = err?.message || String(err);
  _lastFailureTime = Date.now();

  if (_circuitState === CIRCUIT_STATE.HALF_OPEN) {
    // Probe failed — back to open
    _circuitState = CIRCUIT_STATE.OPEN;
    _halfOpenInFlight = 0;
    console.warn('[SupabaseResilience] Circuit breaker → OPEN (probe failed)');
    return;
  }

  if (_consecutiveFailures >= CIRCUIT_BREAKER_CONFIG.failureThreshold && _circuitState === CIRCUIT_STATE.CLOSED) {
    _circuitState = CIRCUIT_STATE.OPEN;
    _metrics.circuitBreakerTrips++;
    console.warn(`[SupabaseResilience] Circuit breaker → OPEN after ${_consecutiveFailures} consecutive failures. Cooldown: ${CIRCUIT_BREAKER_CONFIG.resetTimeoutMs}ms`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// RETRY WITH EXPONENTIAL BACKOFF
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate delay with exponential backoff and jitter.
 * @param {number} attempt - Zero-based attempt number
 * @returns {number} Delay in milliseconds
 */
function _calculateDelay(attempt) {
  const exponential = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  const capped = Math.min(exponential, RETRY_CONFIG.maxDelayMs);
  const jitter = capped * RETRY_CONFIG.jitterFactor * (Math.random() * 2 - 1); // ±25%
  return Math.max(0, Math.round(capped + jitter));
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an error is retryable.
 * Non-retryable: RLS violations, constraint errors, auth failures.
 * Retryable: timeouts, connection refused, pool exhausted, 5xx errors.
 * @param {Object} error - Supabase error object
 * @returns {boolean}
 */
function _isRetryable(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';

  // Non-retryable errors
  if (code === '42501' || msg.includes('permission denied')) return false;
  if (code === '23505' || msg.includes('duplicate key')) return false;
  if (code === '23503' || msg.includes('foreign key')) return false;
  if (code === '42P01' || msg.includes('relation') && msg.includes('does not exist')) return false;
  if (msg.includes('jwt expired') || msg.includes('invalid api key')) return false;

  // Retryable errors
  if (msg.includes('timeout') || msg.includes('timed out')) return true;
  if (msg.includes('connection') || msg.includes('econnrefused')) return true;
  if (msg.includes('pool') || msg.includes('exhausted')) return true;
  if (msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
  if (msg.includes('fetch failed') || msg.includes('network')) return true;
  if (msg.includes('socket hang up') || msg.includes('econnreset')) return true;
  if (msg.includes('dns') || msg.includes('getaddrinfo')) return true;

  // Default: retry for unknown errors (conservative)
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

/**
 * Execute a Supabase READ operation with retry and circuit breaker.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Function} queryFn - Function that returns a Supabase query promise
 * @param {Object} [options]
 * @param {string} [options.label] - Human-readable label for logging
 * @param {number} [options.maxAttempts] - Override default max attempts
 * @param {boolean} [options.critical] - If true, always retry (ignore circuit breaker)
 * @returns {Promise<{ data: any, error: any }>} Supabase-style response
 */
async function resilientQuery(supabase, queryFn, options = {}) {
  if (!supabase) return { data: null, error: { message: 'No Supabase client' } };
  _metrics.totalQueries++;

  const label = options.label || 'query';
  const maxAttempts = options.maxAttempts || RETRY_CONFIG.maxAttempts;

  // Circuit breaker check (skip for critical operations)
  if (!options.critical && !_checkCircuitBreaker()) {
    _metrics.failedOps++;
    return { data: null, error: { message: `[SupabaseResilience] Circuit breaker OPEN — ${label} rejected` } };
  }

  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await queryFn();

      if (result.error) {
        lastError = result.error;

        if (!_isRetryable(result.error) || attempt === maxAttempts - 1) {
          _onFailure(result.error);
          return result;
        }

        // Retryable error — back off and try again
        const delay = _calculateDelay(attempt);
        _metrics.retriedOps++;
        _metrics.totalRetryDelayMs += delay;
        if (attempt > 0) {
          console.warn(`[SupabaseResilience] ${label} attempt ${attempt + 1}/${maxAttempts} failed: ${result.error.message}. Retrying in ${delay}ms...`);
        }
        await _sleep(delay);
        continue;
      }

      // Success
      _onSuccess();
      return result;

    } catch (err) {
      lastError = err;

      if (!_isRetryable(err) || attempt === maxAttempts - 1) {
        _onFailure(err);
        return { data: null, error: { message: err.message || String(err) } };
      }

      const delay = _calculateDelay(attempt);
      _metrics.retriedOps++;
      _metrics.totalRetryDelayMs += delay;
      console.warn(`[SupabaseResilience] ${label} attempt ${attempt + 1}/${maxAttempts} threw: ${err.message}. Retrying in ${delay}ms...`);
      await _sleep(delay);
    }
  }

  _onFailure(lastError);
  return { data: null, error: lastError || { message: 'Max retries exceeded' } };
}

/**
 * Execute a Supabase WRITE operation with retry and circuit breaker.
 * Same as resilientQuery but tracked separately for metrics.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Function} mutationFn - Function that returns a Supabase mutation promise
 * @param {Object} [options]
 * @param {string} [options.label] - Human-readable label for logging
 * @param {number} [options.maxAttempts] - Override default max attempts
 * @param {boolean} [options.critical] - If true, always retry (ignore circuit breaker)
 * @param {boolean} [options.idempotent] - If true, safe to retry mutations (default: true for upsert)
 * @returns {Promise<{ data: any, error: any }>} Supabase-style response
 */
async function resilientMutation(supabase, mutationFn, options = {}) {
  if (!supabase) return { data: null, error: { message: 'No Supabase client' } };
  _metrics.totalMutations++;

  // For mutations, default to fewer retries unless marked idempotent
  const maxAttempts = options.maxAttempts || (options.idempotent !== false ? RETRY_CONFIG.maxAttempts : 2);
  return resilientQuery(supabase, mutationFn, { ...options, maxAttempts });
}

/**
 * Probe Supabase connection health.
 * Used by the Health Watchdog to check if the DB is reachable.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ healthy: boolean, latencyMs: number, error?: string }>}
 */
async function probeHealth(supabase) {
  if (!supabase) return { healthy: false, latencyMs: 0, error: 'No client' };

  const start = Date.now();
  try {
    // Lightweight query that hits the connection pool
    const { error } = await supabase.from('tables').select('id').limit(1);
    const latencyMs = Date.now() - start;

    if (error) {
      return { healthy: false, latencyMs, error: error.message };
    }

    _onSuccess(); // Reset circuit breaker on successful probe
    return { healthy: true, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return { healthy: false, latencyMs, error: err.message };
  }
}

/**
 * Get current circuit breaker and connection health status.
 * @returns {{ state: string, consecutiveFailures: number, metrics: Object }}
 */
function getHealth() {
  return {
    state: _circuitState,
    consecutiveFailures: _consecutiveFailures,
    metrics: getMetrics(),
  };
}

/**
 * Reset circuit breaker state (for testing or manual recovery).
 */
function resetCircuitBreaker() {
  _circuitState = CIRCUIT_STATE.CLOSED;
  _consecutiveFailures = 0;
  _halfOpenInFlight = 0;
  console.debug('[SupabaseResilience] Circuit breaker manually reset → CLOSED');
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  resilientQuery,
  resilientMutation,
  probeHealth,
  getHealth,
  getMetrics,
  resetCircuitBreaker,
  // Expose internals for testing
  _isRetryable,
  _calculateDelay,
  CIRCUIT_STATE,
  RETRY_CONFIG,
  CIRCUIT_BREAKER_CONFIG,
};
