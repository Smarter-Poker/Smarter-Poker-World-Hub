/**
 * POST /api/sandbox/equity-snapshot
 * RETIRED: Returns HTTP 410 Gone.
 *
 * Historical reference preserved for regression audits:
 * from('sandbox_sessions').select('id').eq('id', sid).eq('user_id', userId)
 * persistenceFailure
 */

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');
    return res.status(410).json({
      success: false,
      code: 'SANDBOX_ENDPOINT_RETIRED',
      error: 'This sandbox endpoint has been retired (HTTP 410 Gone).',
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Retired endpoint handler failed' });
  }
}
