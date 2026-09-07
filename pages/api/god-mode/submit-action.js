import { withTiming } from '../../../src/utils/trainingApiUtils';

/**
 * RETIRED: the former God Mode prototype accepted answer material from the
 * browser and fabricated a mock solver node when evidence was absent. Server-
 * authoritative Training grading now requires a sealed attempt and canonical
 * question identity, so this compatibility endpoint must fail closed.
 */
export default function handler(_req, res) {
  withTiming(res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({
    success: false,
    code: 'LEGACY_GOD_MODE_GRADING_RETIRED',
    error: 'Legacy client-authored grading is retired. Submit answers through the verified Training attempt API.',
  });
}
