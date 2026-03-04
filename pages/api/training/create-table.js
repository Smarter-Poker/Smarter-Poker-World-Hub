// BUG #283: DISABLED — One-time DDL setup script had ZERO authentication.
// Any unauthenticated request could execute arbitrary SQL via exec_sql RPC.
// This endpoint should never be publicly accessible.
export default function handler(req, res) {
  return res.status(410).json({ error: 'This endpoint has been retired' });
}
