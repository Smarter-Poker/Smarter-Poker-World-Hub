/**
 * ═══════════════════════════════════════════════════════════════════
 * UTC Cron Wrapper — ORB-4 Timezone-Agnostic Execution
 * /src/lib/club-arena/utcCronWrapper.js
 *
 * MANDATE 2: All scheduled operations must execute at exact UTC times.
 * This wrapper provides:
 *  1. UTC day/hour verification (rejects if server drift > 5 minutes)
 *  2. Idempotency guard — prevents duplicate execution via execution log
 *  3. Structured logging with UTC timestamps
 *
 * Usage in cron API routes:
 *   import { createUtcCronGuard } from '../../../src/lib/club-arena/utcCronWrapper';
 *
 *   const guard = createUtcCronGuard({
 *     cronId: 'auto-settlement-weekly',
 *     expectedUtcDay: 1,   // Monday
 *     expectedUtcHour: 10, // 10:00 UTC
 *     toleranceMinutes: 5,
 *   });
 *
 *   export default async function handler(req, res) {
 *     const check = guard.verify();
 *     if (!check.ok) return res.status(200).json({ skipped: true, reason: check.reason });
 *     // ... execute settlement logic
 *   }
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * Create a UTC cron guard with drift protection and idempotency.
 *
 * @param {Object} config
 * @param {string} config.cronId - Unique identifier for this cron job (for idempotency)
 * @param {number} [config.expectedUtcDay] - Expected UTC day of week (0=Sun..6=Sat). Omit for daily crons.
 * @param {number} [config.expectedUtcHour] - Expected UTC hour (0-23). Omit for flexible scheduling.
 * @param {number} [config.toleranceMinutes=5] - Tolerance window in minutes around expected time.
 */
export function createUtcCronGuard(config) {
    const {
        cronId,
        expectedUtcDay,
        expectedUtcHour,
        toleranceMinutes = 5,
    } = config;

    return {
        /**
         * Verify the current UTC time is within the expected execution window.
         * @returns {{ ok: boolean, reason?: string, utcNow: string, utcDay: number, utcHour: number, utcMinute: number }}
         */
        verify() {
            const now = new Date();
            const utcDay = now.getUTCDay();
            const utcHour = now.getUTCHours();
            const utcMinute = now.getUTCMinutes();
            const utcNow = now.toISOString();

            // Day-of-week check (if configured)
            if (expectedUtcDay !== undefined && utcDay !== expectedUtcDay) {
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                return {
                    ok: false,
                    reason: `UTC day mismatch: expected ${dayNames[expectedUtcDay]} (${expectedUtcDay}), got ${dayNames[utcDay]} (${utcDay})`,
                    utcNow, utcDay, utcHour, utcMinute,
                };
            }

            // Hour check with tolerance (if configured)
            if (expectedUtcHour !== undefined) {
                const expectedMinuteOfDay = expectedUtcHour * 60;
                const actualMinuteOfDay = utcHour * 60 + utcMinute;
                const drift = Math.abs(actualMinuteOfDay - expectedMinuteOfDay);

                if (drift > toleranceMinutes && drift < (1440 - toleranceMinutes)) {
                    return {
                        ok: false,
                        reason: `UTC time drift too large: expected ~${String(expectedUtcHour).padStart(2, '0')}:00, got ${String(utcHour).padStart(2, '0')}:${String(utcMinute).padStart(2, '0')} (${drift}min drift, max ${toleranceMinutes}min)`,
                        utcNow, utcDay, utcHour, utcMinute,
                    };
                }
            }

            return { ok: true, utcNow, utcDay, utcHour, utcMinute };
        },

        /**
         * Generate an idempotency key for the current UTC execution window.
         * Format: {cronId}:{YYYY-MM-DD}:{HH}
         */
        getIdempotencyKey() {
            const now = new Date();
            const dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
            const hourStr = String(now.getUTCHours()).padStart(2, '0');
            return `${cronId}:${dateStr}:${hourStr}`;
        },

        /**
         * Check if this cron has already executed in the current window (idempotency).
         * Requires a Supabase admin client and a `cron_execution_log` table.
         *
         * @param {Object} supabaseAdmin - Supabase admin client
         * @returns {Promise<{ alreadyRan: boolean, key: string }>}
         */
        async checkIdempotency(supabaseAdmin) {
            const key = this.getIdempotencyKey();
            try {
                const { data } = await supabaseAdmin
                    .from('cron_execution_log')
                    .select('id')
                    .eq('execution_key', key)
                    .maybeSingle();

                return { alreadyRan: !!data, key };
            } catch (err) {
                // If table doesn't exist, assume not yet executed (fail-open)
                console.warn(`[utcCronWrapper] Idempotency check failed for ${key}:`, err.message);
                return { alreadyRan: false, key };
            }
        },

        /**
         * Mark the current execution as completed (prevents re-execution).
         *
         * @param {Object} supabaseAdmin - Supabase admin client
         * @param {Object} [metadata] - Optional metadata to store with the execution record
         * @returns {Promise<void>}
         */
        async markExecuted(supabaseAdmin, metadata = {}) {
            const key = this.getIdempotencyKey();
            try {
                await supabaseAdmin
                    .from('cron_execution_log')
                    .upsert({
                        execution_key: key,
                        cron_id: cronId,
                        executed_at: new Date().toISOString(),
                        metadata,
                    }, { onConflict: 'execution_key' });
            } catch (err) {
                console.error(`[utcCronWrapper] Failed to mark ${key} as executed:`, err.message);
            }
        },

        /** Metadata for logging */
        cronId,
        config,
    };
}

/**
 * Convenience: Full cron guard pipeline.
 * Verifies UTC time, checks idempotency, runs handler, marks as executed.
 *
 * @param {Object} opts
 * @param {Object} opts.guard - Result from createUtcCronGuard()
 * @param {Object} opts.supabaseAdmin - Supabase admin client
 * @param {Function} opts.handler - Async function to execute if all checks pass
 * @param {Object} opts.res - Express/Next.js response object
 * @returns {Promise<void>}
 */
export async function executeUtcCron({ guard, supabaseAdmin, handler, res }) {
    // Step 1: UTC verification
    const check = guard.verify();
    if (!check.ok) {
        console.log(`[${guard.cronId}] Skipped: ${check.reason}`);
        return res.status(200).json({ success: true, skipped: true, reason: check.reason, utcNow: check.utcNow });
    }

    // Step 2: Idempotency check
    const { alreadyRan, key } = await guard.checkIdempotency(supabaseAdmin);
    if (alreadyRan) {
        console.log(`[${guard.cronId}] Skipped: already executed (${key})`);
        return res.status(200).json({ success: true, skipped: true, reason: `Already executed: ${key}` });
    }

    // Step 3: Execute handler
    try {
        const result = await handler();

        // Step 4: Mark as executed
        await guard.markExecuted(supabaseAdmin, { result: result || 'ok', utcNow: check.utcNow });

        return res.status(200).json({ success: true, executed: true, key, result });
    } catch (err) {
        console.error(`[${guard.cronId}] Execution failed:`, err);
        return res.status(500).json({ success: false, error: err.message, key });
    }
}
