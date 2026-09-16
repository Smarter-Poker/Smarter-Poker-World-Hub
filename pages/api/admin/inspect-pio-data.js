/**
 * Inspect PioSolver Data API
 * Shows a bounded sample of artifacts admitted by the active solver catalog.
 * 
 * GET /api/admin/inspect-pio-data
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { SolverPolicyService } from '../../../src/services/SolverPolicyService.js';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Solver inspection service is not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    // BUG #167 FIX: Block in production
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          const policyService = new SolverPolicyService({ db: getSupabase() });
          const inspection = await policyService.inspectWarehouse();
          const samplePolicy = policyService.consumerEnvelope(
              inspection.samplePolicy, 'admin-inspection',
          );
          return res.status(200).json({
              success: true,
              totalScenarios: inspection.sampledRows,
              byGameType: inspection.byGameType,
              byStreet: inspection.byStreet,
              byStackDepth: inspection.byStackDepth,
              acceptedPolicySamples: inspection.acceptedPolicySamples,
              rejectedPolicySamples: inspection.rejectedPolicySamples,
              sampleScenario: inspection.sampleMetadata,
              solverPolicy: samplePolicy,
          });
      } catch (error) {
          console.warn('[Inspect PIO] Error:', error);
          return res.status(500).json({ error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
