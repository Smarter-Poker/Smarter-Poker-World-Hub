/** Retired deployment-autofix status endpoint. */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'GET');
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, code: 'method_not_allowed', error: 'Method Not Allowed' });
  }
  return res.status(410).json({
    ok: false,
    code: 'deployment_autofix_retired',
    error: 'Deployment Autofix Status Is Retired',
    action: 'none',
  });
}
