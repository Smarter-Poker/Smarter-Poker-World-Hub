// ═══════════════════════════════════════════════════════════════════
// DISABLED — One-time admin utility. Permanently retired for security.
// These endpoints had no authentication and performed write operations.
// Use Supabase Dashboard for any manual database operations.
// ═══════════════════════════════════════════════════════════════════
export default function handler(req, res) {
  return res.status(410).json({
    error: 'This endpoint has been permanently disabled for security.',
    message: 'Use Supabase Dashboard SQL Editor for manual operations.'
  });
}
