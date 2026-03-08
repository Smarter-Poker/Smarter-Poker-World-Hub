/**
 * Cache Performance Telemetry
 * ═══════════════════════════════════════════════════════
 * Lightweight hit/miss/eviction counter for the SWR
 * auto-cache layer. Dev-only — no external requests.
 *
 * Access from console:  window.__spCacheTelemetry.report()
 */

const telemetry = {
    hits: 0,
    misses: 0,
    evictions: 0,
    corruptions: 0,
    _startedAt: Date.now(),
};

/** Record a cache hit */
export function recordHit() { telemetry.hits++; }

/** Record a cache miss */
export function recordMiss() { telemetry.misses++; }

/** Record an eviction (LRU or reaper) */
export function recordEviction() { telemetry.evictions++; }

/** Record a corruption (self-heal) */
export function recordCorruption() { telemetry.corruptions++; }

/** Get the hit rate as a percentage */
function hitRate() {
    const total = telemetry.hits + telemetry.misses;
    if (total === 0) return 'N/A';
    return (telemetry.hits / total * 100).toFixed(1) + '%';
}

/** Print a summary report to the console */
function report() {
    const uptime = ((Date.now() - telemetry._startedAt) / 1000).toFixed(0);
    console.table({
        'Cache Hits': telemetry.hits,
        'Cache Misses': telemetry.misses,
        'Hit Rate': hitRate(),
        'Evictions': telemetry.evictions,
        'Corruptions Healed': telemetry.corruptions,
        'Uptime (seconds)': uptime,
    });
    return telemetry;
}

// Expose on window for console debugging
if (typeof window !== 'undefined') {
    window.__spCacheTelemetry = { ...telemetry, report, hitRate };
}
