import { rateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { attachPersonalAssistantTiming } from '../../../../src/lib/personal-assistant/serverTiming.mjs';

/**
 * RETIRED: the former sandbox analyzer could substitute a nearby stack, board,
 * or game family, read the legacy `strategy_matrix` column, and manufacture a
 * model/heuristic answer when no exact artifact existed. Those results cannot
 * be graded or described as solver output. Verified decisions are delivered by
 * the signed Training question pipeline instead.
 */
export default async function handler(req, res) {
  attachPersonalAssistantTiming(res, 'sandbox_analysis_retired');

  try {
    const rl = rateLimit(req, LIMITS.write);
    Object.entries(rl.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    if (!rl.ok) {
      if (rl.retryAfter) res.setHeader('Retry-After', String(rl.retryAfter));
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        error: 'Too many requests',
        retryAfter: rl.retryAfter,
      });
    }

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(410).json({
      success: false,
      available: false,
      retired: true,
      code: 'SANDBOX_ANALYSIS_REQUIRES_VERIFIED_EVIDENCE',
      error:
        'Approximate sandbox analysis is retired. Start a verified Training attempt for an evidence-backed answer.',
      verifiedRoute: '/hub/training',
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(500).json({
      success: false,
      code: 'SANDBOX_ANALYSIS_RETIREMENT_ERROR',
      error: 'Sandbox analysis is unavailable.',
    });
  }
}
