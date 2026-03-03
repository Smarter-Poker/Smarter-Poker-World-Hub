// DISABLED — One-time admin utility. Permanently retired for security.
export default function handler(req, res) {
  return res.status(410).json({ error: "This endpoint has been permanently disabled for security." });
}
