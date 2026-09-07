import { withTiming } from '../../../src/utils/trainingApiUtils';

/**
 * RETIRED: the former God Mode prototype sampled legacy solver rows, applied a
 * random suit transform, and returned an unsigned client-gradeable answer.
 * Canonical Training hands are now delivered only as sealed attempts by the
 * Training question APIs.
 */
export default function handler(_req, res) {
  withTiming(res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({
    success: false,
    code: 'LEGACY_GOD_MODE_HAND_DELIVERY_RETIRED',
    error: 'Legacy hand delivery is retired. Start a verified Training attempt from the Training Hub.',
  });
}
