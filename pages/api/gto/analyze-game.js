/**
 * RETIRED: this route accepted browser-authored mistakes, scores, and answer
 * keys. Verified coaching is derived from sealed Training session projections.
 */
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({
    success: false,
    code: 'GTO_GAME_ANALYSIS_REQUIRES_VERIFIED_SESSION',
    error: 'Open verified Training history for authoritative coaching.',
  });
}
