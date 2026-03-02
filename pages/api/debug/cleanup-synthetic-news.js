// DISABLED — Debug utility with write operations. Permanently retired for security.
export default function handler(req, res) {
  return res.status(410).json({ error: 'Debug endpoint permanently disabled.' });
}
