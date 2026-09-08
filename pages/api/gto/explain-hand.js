/**
 * RETIRED: this route accepted a browser-supplied "correct" action and then
 * restated it as solver authority. Verified explanations must be derived from
 * a sealed Training attempt and question snapshot.
 */
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({
    success: false,
    code: 'GTO_EXPLANATION_REQUIRES_VERIFIED_ATTEMPT',
    error: 'Open the verified Training Arena for an audited explanation.',
  });
}
