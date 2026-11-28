/**
 * POST /api/training/chart-study
 * Server-recorded GTO chart study sessions that pay the advertised
 * gto_chart_study reward. All rules live in src/lib/training/chartStudy.js
 * and public.fn_chart_study_event.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createChartStudyHandler } from '../../../src/lib/training/chartStudy';

// fn_chart_study_event is GRANTed to service_role only.
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default createChartStudyHandler({
    getSupabase,
    rateLimit: (req, res) => applyRateLimit(req, res, LIMITS.write),
});
