/**
 * 🚫 ENDPOINT REMOVED — Operation Grok-Sweep (2026-05)
 * ═══════════════════════════════════════════════════════════════════════════
 * This endpoint previously generated session recommendations via grok-3.
 * It had zero frontend callers when deleted. The replacement is the
 * deterministic engine via pages/api/training/get-question and the
 * coaching-summary deterministic templates.
 *
 * Returns 410 Gone for any client still pointed at this URL.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(410).json({
        success: false,
        error: 'Endpoint removed',
        message: 'This endpoint was retired by Operation Grok-Sweep. No replacement is required — engine-only training does not use Grok-generated session recommendations.',
    });
}
