// DISABLED: One-time seed/import route — no auth, service-role writes.
export default function handler(req, res) {
  return res.status(410).json({
    error: 'This endpoint has been permanently disabled',
    reason: 'One-time setup route with no authentication',
  });
}
