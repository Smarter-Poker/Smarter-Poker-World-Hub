/**
 * 🚫 ENDPOINT REMOVED — Operation Grok-Sweep Phase 3 (2026-05)
 * ═══════════════════════════════════════════════════════════════════════════
 * This endpoint generated EXPLOIT/SIMPLIFY coaching narrative via grok-3-mini.
 * Audit found zero frontend callers — pure dead code consuming tokens (or
 * waiting to). Removed for the same reason the other dead grok-3 endpoints
 * were retired.
 *
 * If you need exploit/simplify coaching prose in the future, build it from
 * deterministic templates over the user's actual session metrics — same
 * pattern as src/lib/explanationTemplates.js. Do not re-introduce a
 * Grok-backed coaching endpoint.
 *
 * Returns 410 Gone for any client still pointed at this URL.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(410).json({
        success: false,
        error: 'Endpoint removed',
        message: 'This endpoint was retired by Operation Grok-Sweep. Build coaching prose from deterministic templates over real session metrics.',
    });
}
