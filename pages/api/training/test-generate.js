/**
 * 🚫 ENDPOINT REMOVED — Operation Grok-Sweep Phase 46 (2026-05)
 * ═══════════════════════════════════════════════════════════════════════════
 * This was an admin "quick test" generator for mtt-007. It used the same
 * generateQuestionWithGrok path as generate-batch-questions.js (now also
 * tombstoned), producing hallucinated grok-3-mini output with a schema
 * that doesn't match consumer expectations.
 *
 * Replacement for testing: run the apply_migration MCP against the cache
 * with a single-row INSERT cloned from a verified donor, then read it
 * back via /api/training/get-question.
 *
 * Returns 410 Gone for any client still pointed at this URL.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(410).json({
        success: false,
        error: 'Endpoint removed',
        message:
            'This endpoint was retired by Operation Grok-Sweep Phase 46. For test-generation, ' +
            'use a single-row SQL INSERT cloned from a verified donor in training_question_cache.',
    });
}
