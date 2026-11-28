/**
 * GTO CHART STUDY - server-recorded study sessions (gto_chart_study reward)
 * ═══════════════════════════════════════════════════════════════════════════
 * The diamond catalog has advertised gto_chart_study (5 diamonds, two per
 * Chicago day) since 2026-07-31 and Club Arena's Diamond Earn page sends
 * players to /hub/training/preflop-charts for it, but nothing ever paid it:
 * its verifyNote requires "a server-recorded study session of sufficient
 * dwell time" and none existed. This is that recording.
 *
 * The browser only says WHAT happened (start, ping, finish, status) and WHICH
 * chart is on screen. It never sends a duration, an amount or a user id:
 *   - the user is the one the bearer token belongs to (supabase.auth.getUser),
 *   - every time value is the database's now(), inside
 *     public.fn_chart_study_event (service_role only),
 *   - the amount, the daily limit, the caps and reference-id idempotency are
 *     award_diamonds_v2's, read from the catalog.
 * See supabase/migrations/*_gto_chart_study_is_awarded.sql for the rules.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CHART_STUDY_EVENTS = Object.freeze(['start', 'ping', 'finish', 'status']);
const EVENTS = new Set(CHART_STUDY_EVENTS);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same pattern the database enforces: the browser's own scenarios and positions. */
export const CHART_KEY = /^(rfi|vs3bet|bb_defense):(UTG|MP|HJ|CO|BTN|SB)$/;

/** The page's chart identity, or null when it is not a supported chart. */
export function chartKeyFor(scenario, position) {
    const key = `${scenario}:${position}`;
    return CHART_KEY.test(key) ? key : null;
}

/** The RPC is not installed yet: answer "unavailable", never a 500. */
export function isMissingFunction(error) {
    const text = [error?.code, error?.message, error?.details, error?.hint]
        .filter((v) => typeof v === 'string' && v)
        .join(' ');
    return /PGRST202|42883/.test(text)
        || (/fn_chart_study_event/.test(text) && /could not find|does not exist/i.test(text));
}

/** Validates a request body. Returns { event, sessionId, chart } or { error }. */
export function parseStudyRequest(body) {
    const b = body && typeof body === 'object' ? body : {};
    const event = typeof b.event === 'string' ? b.event : '';
    if (!EVENTS.has(event)) return { error: 'Unknown event' };
    const sessionId = typeof b.sessionId === 'string' && UUID.test(b.sessionId) ? b.sessionId : null;
    if ((event === 'ping' || event === 'finish') && !sessionId) return { error: 'Session required' };
    const chart = typeof b.chart === 'string' && CHART_KEY.test(b.chart) ? b.chart : null;
    return { event, sessionId, chart };
}

/**
 * Builds the API handler. getSupabase returns a service-role client;
 * rateLimit(req, res) returns false after it has answered 429.
 */
export function createChartStudyHandler({ getSupabase, rateLimit }) {
    return async function chartStudyHandler(req, res) {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ ok: false, error: 'Method not allowed' });
        }
        if (!rateLimit(req, res)) return undefined;

        const supabase = getSupabase();
        const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
        if (!token) return res.status(401).json({ ok: false, error: 'Sign in to record study' });
        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        const userId = authData?.user?.id;
        if (authErr || !userId) return res.status(401).json({ ok: false, error: 'Sign in to record study' });

        const parsed = parseStudyRequest(req.body);
        if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });

        const { data, error } = await supabase.rpc('fn_chart_study_event', {
            p_user_id: userId,
            p_event: parsed.event,
            p_session_id: parsed.sessionId,
            p_chart: parsed.chart,
        });
        res.setHeader('Cache-Control', 'no-store');
        if (error) {
            if (isMissingFunction(error)) return res.status(200).json({ ok: false, available: false });
            console.warn('[api/training/chart-study] rpc failed:', error?.message || error);
            return res.status(503).json({ ok: false, error: 'Study recording is unavailable right now' });
        }
        return res.status(200).json({ ...(data && typeof data === 'object' ? data : {}), available: true });
    };
}
