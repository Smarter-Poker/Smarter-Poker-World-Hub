import { withTiming } from '../../../src/utils/trainingApiUtils';

/**
 * RETIRED: the former endpoint read unaudited legacy strategy matrices and
 * derived solver-looking output without a provenance-complete decision node.
 */
export default function handler(_req, res) {
  withTiming(res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({
    success: false,
    code: 'SOLVER_AGGREGATE_REPORT_REQUIRES_AUDITED_COHORT',
    error: 'Aggregate solver reports require a provenance-complete audited cohort.',
  });
}
