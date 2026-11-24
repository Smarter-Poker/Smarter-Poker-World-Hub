// DISABLED · One-time setup script. No longer needed in production.
// See BUG #122 in security audit.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({ error: 'This endpoint has been retired' });
}
