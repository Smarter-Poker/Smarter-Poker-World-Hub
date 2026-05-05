/**
 * 🚫 ENDPOINT REMOVED — Operation Grok-Sweep (2026-05)
 * ═══════════════════════════════════════════════════════════════════════════
 * This endpoint's original docblock literally said:
 *   "Generates completely unique poker scenarios using Grok... NEVER repeats"
 * That is the exact behavior the platform's "no AI hallucinations for math"
 * policy forbids. The endpoint had zero frontend callers when deleted.
 *
 * The deterministic engine generates a virtually unlimited variety of
 * solver-backed training spots from solved_spots_gold (5.3M rows). Use
 * /api/training/get-question instead.
 *
 * Returns 410 Gone for any client still pointed at this URL.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(410).json({
        success: false,
        error: 'Endpoint removed',
        message: 'This endpoint was retired by Operation Grok-Sweep. Use /api/training/get-question for engine-backed solver-real scenarios.',
    });
}
