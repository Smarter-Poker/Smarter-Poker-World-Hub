import { withTiming } from '../../../src/utils/trainingApiUtils';

/**
 * RETIRED: this externally reachable route selected the legacy
 * `strategy_matrix` column with approximate identity tiers and could replace a
 * missing artifact with generated prose. Neither path is an audited solver
 * decision. The current Training product uses provenance-complete
 * `strategy_matrix_v2` artifacts through its signed question pipeline.
 */
export default function handler(_req, res) {
  withTiming(res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({
    success: false,
    code: 'LEGACY_GTO_ANALYSIS_RETIRED',
    error: 'Legacy approximate analysis is retired. Use an audited Training question or Solutions artifact.',
  });
}
