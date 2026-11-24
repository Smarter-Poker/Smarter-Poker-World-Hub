/**
 * GET/POST /api/admin/trivia-pool-curate
 *
 * Protected by Trivia operator authority (requireTriviaOperator).
 * - GET: returns empirical difficulty calibration outliers, per-category
 *   eligible pool depth & 90-day supply alerts, and sample rows from either
 *   review_queue or unaudited backlog.
 * - POST: executes bounded, reason-required batch curation via
 *   trivia_pool_batch_curate_v1 (approve, quarantine, set_difficulty_*).
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { normalizeOperatorContext } from '../../../src/lib/trivia/operationsSnapshot.mjs';
import { TRIVIA_STUDY_CATEGORIES } from '../../../src/lib/trivia/trainingSpotMap.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CATEGORIES = new Set(TRIVIA_STUDY_CATEGORIES);
const ALLOWED_ACTIONS = new Set([
    'approve',
    'quarantine',
    'set_difficulty_easy',
    'set_difficulty_medium',
    'set_difficulty_hard',
]);
const MAX_BATCH_IDS = 100;

let cachedClient = null;
function serviceClient() {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) return null;
    if (!cachedClient) {
        cachedClient = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }
    return cachedClient;
}

export async function requireTriviaOperator(req, res, client) {
    const hasBearer = Boolean(req.headers?.authorization?.startsWith('Bearer '));
    const hasCookie = Boolean(req.headers?.cookie);
    if (!hasBearer && !hasCookie) {
        res.status(401).json({ success: false, error: 'authorization_required' });
        return null;
    }

    const { user, error } = await getServerUserWithFallback(req, client);
    if (error || !user?.id) {
        res.status(401).json({ success: false, error: 'invalid_session' });
        return null;
    }

    const { data, error: contextError } = await client.rpc('trivia_operator_context_v1', {
        p_operator_id: user.id,
    });
    if (contextError) {
        console.warn('[trivia-pool-curate] operator context unavailable:', contextError.code || 'read_failed');
        res.status(503).json({ success: false, error: 'operator_context_unavailable' });
        return null;
    }

    const context = normalizeOperatorContext(data);
    if (!context.allowed) {
        res.status(403).json({ success: false, error: 'trivia_operator_required' });
        return null;
    }

    let isAdminProfile = false;
    const { data: profile } = await client
        .from('profiles')
        .select('is_admin, role')
        .eq('id', user.id)
        .maybeSingle();
    if (profile && (profile.is_admin === true || ['admin', 'superadmin', 'god'].includes(profile.role))) {
        isAdminProfile = true;
    }

    const canCurate = context.roles.includes('supervisor')
        || context.roles.includes('question_curator')
        || context.capabilities.includes('question_quarantine')
        || context.capabilities.includes('question_release')
        || isAdminProfile;

    return { user, context, canCurate };
}

function parseIntClamped(raw, fallback, min, max) {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const parsed = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function parseBatchBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'invalid_request_body' };
    }
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    if (!ALLOWED_ACTIONS.has(action)) {
        return { ok: false, error: 'unsupported_action' };
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 8 || reason.length > 500) {
        return { ok: false, error: 'reason_required' };
    }
    const rawIds = Array.isArray(body.questionIds) ? body.questionIds : null;
    if (!rawIds || rawIds.length === 0) {
        return { ok: false, error: 'question_ids_required' };
    }
    const uniqueIds = [];
    const seen = new Set();
    for (const rawId of rawIds) {
        if (typeof rawId !== 'string' || !UUID_RE.test(rawId.trim())) {
            return { ok: false, error: 'invalid_question_id' };
        }
        const normalized = rawId.trim().toLowerCase();
        if (!seen.has(normalized)) {
            seen.add(normalized);
            uniqueIds.push(normalized);
        }
    }
    if (uniqueIds.length > MAX_BATCH_IDS) {
        return { ok: false, error: 'batch_limit_exceeded' };
    }
    return {
        ok: true,
        value: {
            questionIds: uniqueIds,
            action,
            reason,
        },
    };
}

async function fetchQueueItems(client, { queueMode, category, limit }) {
    if (queueMode === 'unaudited') {
        let query = client
            .from('trivia_questions')
            .select('id, category, difficulty, question, options, correct_index, quality_score, audit_verified, source, created_at')
            .is('audit_verified', null)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (category) query = query.eq('category', category);
        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map((row) => ({
            questionId: row.id,
            category: row.category,
            difficulty: row.difficulty,
            question: row.question,
            options: Array.isArray(row.options) ? row.options : [],
            correctIndex: row.correct_index,
            qualityScore: row.quality_score,
            auditVerified: row.audit_verified,
            source: row.source || 'unset',
            createdAt: row.created_at || null,
            priority: null,
        }));
    }

    let reviewQuery = client
        .from('trivia_review_queue_v1')
        .select('question_id, category, difficulty, quality_score, priority, inconclusive_attempts, created_at')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(limit);
    if (category) reviewQuery = reviewQuery.eq('category', category);
    const { data: queueRows, error: queueError } = await reviewQuery;
    if (queueError) throw queueError;

    const ids = (queueRows || []).map((r) => r.question_id).filter(Boolean);
    if (ids.length === 0) return [];

    const { data: questions, error: qError } = await client
        .from('trivia_questions')
        .select('id, question, options, correct_index, audit_verified, source')
        .in('id', ids);
    if (qError) throw qError;

    const byId = new Map((questions || []).map((q) => [q.id, q]));
    return (queueRows || []).map((row) => {
        const q = byId.get(row.question_id);
        return {
            questionId: row.question_id,
            category: row.category,
            difficulty: row.difficulty,
            question: q?.question || '',
            options: Array.isArray(q?.options) ? q.options : [],
            correctIndex: q?.correct_index ?? null,
            qualityScore: row.quality_score,
            auditVerified: q?.audit_verified ?? null,
            source: q?.source || 'unset',
            createdAt: row.created_at || null,
            priority: row.priority ?? null,
            inconclusiveAttempts: row.inconclusive_attempts ?? 0,
        };
    });
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Allow', 'GET, POST');

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'POST' ? LIMITS.write : LIMITS.read)) return;

    const client = serviceClient();
    if (!client) {
        return res.status(503).json({ success: false, error: 'server_misconfigured' });
    }

    const operator = await requireTriviaOperator(req, res, client);
    if (!operator) return;

    try {
        if (req.method === 'GET') {
            const queueMode = req.query?.queue === 'unaudited' ? 'unaudited' : 'review_queue';
            const rawCat = typeof req.query?.category === 'string' ? req.query.category.trim() : '';
            const category = rawCat && rawCat !== 'all' ? rawCat : null;
            if (category && !VALID_CATEGORIES.has(category)) {
                return res.status(400).json({ success: false, error: 'invalid_category' });
            }
            const minShown = parseIntClamped(req.query?.minShown, 15, 1, 10000);
            const limit = parseIntClamped(req.query?.limit, 40, 1, 100);

            const [calResult, queueItems] = await Promise.all([
                client.rpc('trivia_question_calibration_report_v1', {
                    p_min_shown: minShown,
                    p_limit: 100,
                }),
                fetchQueueItems(client, { queueMode, category, limit }),
            ]);

            if (calResult.error || !calResult.data?.success) {
                if (calResult.error) {
                    try { reportApiError(calResult.error, { route: '/api/admin/trivia-pool-curate', op: 'calibration' }); } catch (_) {}
                }
                return res.status(503).json({ success: false, error: 'calibration_report_unavailable' });
            }

            const cal = calResult.data;
            const categoryDepth = Array.isArray(cal.category_depth) ? cal.category_depth : [];
            const categoryDepthAlerts = categoryDepth.filter((row) => row.below_90_day_supply === true);

            return res.status(200).json({
                success: true,
                generatedAt: new Date().toISOString(),
                operator: {
                    roles: operator.context.roles,
                    capabilities: operator.context.capabilities,
                    canCurate: operator.canCurate,
                },
                calibration: {
                    minShown: Number(cal.min_shown) || minShown,
                    ninetyDayTarget: Number(cal.ninety_day_target_per_category) || 1800,
                    summary: cal.summary && typeof cal.summary === 'object' ? cal.summary : {},
                    outliers: Array.isArray(cal.outliers) ? cal.outliers : [],
                },
                categoryDepth,
                categoryDepthAlerts,
                queue: {
                    mode: queueMode,
                    category: category || 'all',
                    items: queueItems,
                },
            });
        }

        if (!operator.canCurate) {
            return res.status(403).json({ success: false, error: 'operator_capability_required' });
        }

        const parsed = parseBatchBody(req.body);
        if (!parsed.ok) {
            return res.status(400).json({ success: false, error: parsed.error });
        }

        const { questionIds, action, reason } = parsed.value;
        const { data, error } = await client.rpc('trivia_pool_batch_curate_v1', {
            p_operator_id: operator.user.id,
            p_question_ids: questionIds,
            p_action: action,
            p_reason: reason,
        });

        if (error) {
            try { reportApiError(error, { route: '/api/admin/trivia-pool-curate', op: 'batch_curate' }); } catch (_) {}
            return res.status(503).json({ success: false, error: 'curation_rpc_unavailable' });
        }

        if (!data || data.success !== true) {
            const code = data?.error || 'curation_failed';
            const status = code === 'operator_capability_required'
                ? 403
                : code === 'questions_not_found'
                    ? 404
                    : 400;
            return res.status(status).json({ success: false, error: code });
        }

        return res.status(200).json({
            success: true,
            receiptId: data.receipt_id || null,
            action: data.action || action,
            requestedCount: Number(data.requested_count) || questionIds.length,
            affectedCount: Number(data.affected_count) || 0,
            releasedQuarantineCount: Number(data.released_quarantine_count) || 0,
            quarantinedCount: Number(data.quarantined_count) || 0,
            newDifficulty: data.new_difficulty || null,
            missingIds: Array.isArray(data.missing_ids) ? data.missing_ids : [],
        });
    } catch (err) {
        try { reportApiError(err, { route: '/api/admin/trivia-pool-curate' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'pool_curate_request_failed' });
    }
}
