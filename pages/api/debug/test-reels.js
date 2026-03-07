export default function handler(req, res) {
  return res.status(410).json({
    error: 'This debug endpoint has been permanently disabled',
    reason: 'Debug routes are not available in production',
  });
}
