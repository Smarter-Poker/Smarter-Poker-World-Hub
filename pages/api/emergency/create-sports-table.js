// DISABLED — One-time emergency script. No longer needed.
export default function handler(req, res) {
  return res.status(410).json({ error: 'This endpoint has been retired' });
}
