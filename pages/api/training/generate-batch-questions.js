/**
 * 🚫 ENDPOINT REMOVED — Operation Grok-Sweep Phase 46 (2026-05)
 * ═══════════════════════════════════════════════════════════════════════════
 * This endpoint previously generated training questions via grok-3-mini
 * and inserted them into training_question_cache. Phase 46 audit
 * confirmed it produced HALLUCINATED rows that bypassed the solver-
 * correctness work in Phases 31, 33, 39:
 *
 *   - Wrong option-id schema (a/b/c/d Fold/Call/Raise/All-In instead
 *     of the canonical b16/c/b45/f used by frontend feedback)
 *   - heroHand format wrong ("AhKs" specific cards instead of "AKs"
 *     canonical hand notation)
 *   - board format wrong ("Jh7s2d" no spaces instead of "Jh 7s 2d")
 *   - All frequencies hallucinated (no real solver match)
 *
 * Replacement: bulk training_question_cache generation goes through
 * SQL migrations against solved_spots_gold + memory_charts_gold,
 * cloning verified-correct donors. See Phase 33b refill migration as
 * the canonical pattern.
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
            'This endpoint was retired by Operation Grok-Sweep Phase 46 — it produced ' +
            'hallucinated, schema-incorrect rows that bypassed solver verification. For bulk ' +
            'cache generation, write a SQL migration that clones verified-correct donors from ' +
            'training_question_cache or extracts directly from solved_spots_gold via the ' +
            'fn_pio_options_from_solver / fn_chart_options_from_memory helpers.',
    });
}
