// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

export default function handler(req, res) {
  return res.status(410).json({
    error: 'This debug endpoint has been permanently disabled',
    reason: 'Debug routes are not available in production',
  });
}
