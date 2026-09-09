/**
 * RETIRED: paid analysis art cannot be generated from arbitrary browser-owned
 * action, frequency, EV, or explanation claims.
 */
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({
    success: false,
    code: 'GTO_ANALYSIS_CARD_REQUIRES_VERIFIED_EVIDENCE',
    error: 'Analysis cards require sealed solver evidence.',
  });
}
