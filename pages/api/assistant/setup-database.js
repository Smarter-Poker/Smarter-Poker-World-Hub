// DISABLED — One-time setup script. No longer needed in production.
// See BUG #122 in security audit.
export default function handler(req, res) {
  return res.status(410).json({ error: 'This endpoint has been retired' });
}
