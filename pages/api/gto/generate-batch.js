/**
 * 🚫 ENDPOINT REMOVED — Operation Grok-Sweep (2026-05)
 * ═══════════════════════════════════════════════════════════════════════════
 * This endpoint previously batch-generated training scenarios via grok-3 —
 * a direct violation of the "no AI hallucinations for math" policy. It had
 * zero frontend callers when deleted. The replacement for batch scenario
 * generation is the deterministic engine pulling from solved_spots_gold
 * (5.3M real solver spots).
 *
 * Returns 410 Gone for any client still pointed at this URL.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(410).json({
        success: false,
        error: 'Endpoint removed',
        message: 'This endpoint was retired by Operation Grok-Sweep. Use the deterministic engine via /api/training/get-question for solver-backed scenario delivery.',
    });
}
