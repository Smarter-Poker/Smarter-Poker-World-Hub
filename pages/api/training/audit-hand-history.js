import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { parseHandHistory } from '../../../src/engines/HandHistoryParser';
import { auditParsedHands } from '../../../src/lib/training/handAuditEngine';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return _supabase;
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.ai)) return;
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const text = typeof req.body?.handHistoryText === 'string' ? req.body.handHistoryText : '';
    if (!text.trim()) return res.status(400).json({ success: false, error: 'handHistoryText required' });
    if (text.length > 800_000) return res.status(413).json({ success: false, error: 'Hand history file is too large' });

    const hands = parseHandHistory(text).slice(0, 100);
    if (hands.length === 0) {
      return res.status(422).json({ success: false, error: 'No supported hand histories were parsed' });
    }

    const result = await auditParsedHands(getSupabase(), user.id, hands, { maxDecisions: 250, persist: true });
    if (result.persisted === false || result.evidenceReconciled === false) {
      return res.status(503).json({
        ...result,
        success: false,
        persisted: false,
        decisionEvidencePersisted: result.persisted !== false,
        evidenceReconciled: result.evidenceReconciled !== false,
        reason: result.persisted === false ? 'write_failed' : 'reconciliation_failed',
        error: result.persisted === false
          ? 'The hand audit completed, but its decision evidence could not be saved.'
          : 'The hand audit was saved, but obsolete decision evidence could not be reconciled. Please retry.',
      });
    }
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    try { reportApiError(error, req); } catch (_) { /* reporting must not mask response */ }
    console.warn('[HandAudit] Unhandled error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
