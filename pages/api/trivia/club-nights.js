import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ACTIONS = new Set(['create', 'join', 'leave', 'cancel']);
const VALID_QUESTION_COUNTS = new Set([10, 20]);
const VALID_ENTRY_FEES = new Set([0, 10, 25, 50]);

let cachedServiceClient = null;
function serviceClient() {
    if (!cachedServiceClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('club nights server configuration unavailable');
        cachedServiceClient = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }
    return cachedServiceClient;
}

function mapDomainErrorStatus(code) {
    switch (code) {
        case 'authentication_required':
            return 401;
        case 'club_host_forbidden':
        case 'club_membership_required':
            return 403;
        case 'club_not_found':
        case 'club_tournament_not_found':
            return 404;
        case 'club_active_limit_reached':
        case 'tournament_full':
        case 'tournament_not_in_registration':
        case 'registration_closed':
        case 'cannot_cancel_started_tournament':
            return 409;
        default:
            return 400;
    }
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Allow', 'GET, POST');

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return undefined;

    let client;
    try {
        client = serviceClient();
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/club-nights', operation: 'service_client' }); } catch (_) {}
        return res.status(503).json({ success: false, error: 'server_configuration_unavailable' });
    }

    const { user, error: authError } = await getServerUserWithFallback(req, client);
    if (authError || !user?.id) {
        return res.status(401).json({ success: false, error: 'authentication_required' });
    }

    try {
        if (req.method === 'GET') {
            const limitRaw = Number(req.query?.limit);
            const limit = Number.isFinite(limitRaw)
                ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50)
                : 20;

            const { data, error } = await client.rpc('trivia_club_tournament_list_v1', {
                p_user_id: user.id,
                p_limit: limit,
            });
            if (error) {
                try { reportApiError(error, { route: 'trivia/club-nights', operation: 'list', userId: user.id }); } catch (_) {}
                return res.status(500).json({ success: false, error: 'club_nights_list_failed' });
            }
            if (!data || data.success !== true) {
                const code = data?.error || 'club_nights_list_failed';
                return res.status(mapDomainErrorStatus(code)).json({ success: false, error: code });
            }
            return res.status(200).json(data);
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
        if (!VALID_ACTIONS.has(action)) {
            return res.status(400).json({ success: false, error: 'invalid_action' });
        }

        if (action === 'create') {
            const clubId = typeof body.clubId === 'string' ? body.clubId.trim() : '';
            if (!UUID_RE.test(clubId)) {
                return res.status(400).json({ success: false, error: 'invalid_club_id' });
            }

            const title = typeof body.title === 'string' ? body.title.trim() : '';
            if (title.length < 3 || title.length > 80) {
                return res.status(400).json({ success: false, error: 'invalid_title' });
            }

            const rawEntryFee = body.entryFee === undefined || body.entryFee === null || body.entryFee === ''
                ? 0
                : Number(body.entryFee);
            if (!Number.isInteger(rawEntryFee) || !VALID_ENTRY_FEES.has(rawEntryFee)) {
                return res.status(400).json({ success: false, error: 'invalid_entry_fee' });
            }
            if (rawEntryFee !== 0) {
                return res.status(400).json({
                    success: false,
                    error: 'paid_club_escrow_not_enabled',
                    message: 'Private Club Trivia Nights V1 Supports Free-Roll Bragging-Rights Events Only (0 Diamonds).',
                });
            }

            const rawMaxPlayers = body.maxPlayers === undefined || body.maxPlayers === null || body.maxPlayers === ''
                ? 64
                : Number(body.maxPlayers);
            if (!Number.isInteger(rawMaxPlayers) || rawMaxPlayers < 4 || rawMaxPlayers > 256) {
                return res.status(400).json({ success: false, error: 'invalid_max_players' });
            }

            const rawQuestionCount = body.questionCount === undefined || body.questionCount === null || body.questionCount === ''
                ? 10
                : Number(body.questionCount);
            if (!Number.isInteger(rawQuestionCount) || !VALID_QUESTION_COUNTS.has(rawQuestionCount)) {
                return res.status(400).json({ success: false, error: 'invalid_question_count' });
            }

            const rawStart = typeof body.scheduledStartAt === 'string' ? body.scheduledStartAt.trim() : '';
            const startMs = Date.parse(rawStart);
            if (!rawStart || !Number.isFinite(startMs)) {
                return res.status(400).json({ success: false, error: 'invalid_scheduled_start_at' });
            }
            const nowMs = Date.now();
            if (startMs <= nowMs + 2 * 60 * 1000) {
                return res.status(400).json({ success: false, error: 'scheduled_start_must_be_future' });
            }
            if (startMs > nowMs + 30 * 24 * 60 * 60 * 1000) {
                return res.status(400).json({ success: false, error: 'scheduled_start_too_far' });
            }

            const { data, error } = await client.rpc('trivia_club_tournament_create_v1', {
                p_host_user_id: user.id,
                p_club_id: clubId,
                p_title: title,
                p_scheduled_start_at: new Date(startMs).toISOString(),
                p_entry_fee: 0,
                p_max_players: rawMaxPlayers,
                p_question_count: rawQuestionCount,
            });
            if (error) {
                try { reportApiError(error, { route: 'trivia/club-nights', operation: 'create', userId: user.id, clubId }); } catch (_) {}
                return res.status(500).json({ success: false, error: 'club_night_create_failed' });
            }
            if (!data || data.success !== true) {
                const code = data?.error || 'club_night_create_failed';
                return res.status(mapDomainErrorStatus(code)).json({
                    success: false,
                    error: code,
                    ...(data?.message ? { message: data.message } : {}),
                });
            }
            return res.status(201).json(data);
        }

        const clubTournamentId = typeof body.clubTournamentId === 'string' ? body.clubTournamentId.trim() : '';
        if (!UUID_RE.test(clubTournamentId)) {
            return res.status(400).json({ success: false, error: 'invalid_club_tournament_id' });
        }

        if (action === 'join' || action === 'leave') {
            const { data, error } = await client.rpc('trivia_club_tournament_join_v1', {
                p_user_id: user.id,
                p_club_tournament_id: clubTournamentId,
                p_action: action,
            });
            if (error) {
                try { reportApiError(error, { route: 'trivia/club-nights', operation: action, userId: user.id, clubTournamentId }); } catch (_) {}
                return res.status(500).json({ success: false, error: 'club_night_join_failed' });
            }
            if (!data || data.success !== true) {
                const code = data?.error || 'club_night_join_failed';
                return res.status(mapDomainErrorStatus(code)).json({ success: false, error: code });
            }
            return res.status(200).json(data);
        }

        const { data, error } = await client.rpc('trivia_club_tournament_cancel_v1', {
            p_host_user_id: user.id,
            p_club_tournament_id: clubTournamentId,
        });
        if (error) {
            try { reportApiError(error, { route: 'trivia/club-nights', operation: 'cancel', userId: user.id, clubTournamentId }); } catch (_) {}
            return res.status(500).json({ success: false, error: 'club_night_cancel_failed' });
        }
        if (!data || data.success !== true) {
            const code = data?.error || 'club_night_cancel_failed';
            return res.status(mapDomainErrorStatus(code)).json({ success: false, error: code });
        }
        return res.status(200).json(data);
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/club-nights', userId: user.id }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
