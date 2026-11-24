/**
 * GET /api/trivia/study-misses
 *
 * Returns the authenticated player's own historical missed Trivia questions
 * (combining trivia_user_question_history and trivia_question_result_events)
 * via trivia_missed_questions_study_v1 and attaches canonical World Hub
 * Training "Train This Spot" metadata. Read-only: zero diamonds moved.
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import {
    getTrainingSpotForCategory,
    TRIVIA_STUDY_CATEGORIES,
} from '../../../src/lib/trivia/trainingSpotMap.mjs';

const VALID_CATEGORIES = new Set(TRIVIA_STUDY_CATEGORIES);

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

function parseLimit(raw) {
    if (raw === undefined || raw === null || raw === '') return 25;
    const parsed = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(parsed)) return 25;
    return Math.min(Math.max(parsed, 1), 100);
}

function parseCategory(raw) {
    if (raw === undefined || raw === null) return { ok: true, value: null };
    const trimmed = String(raw).trim();
    if (!trimmed || trimmed === 'all') return { ok: true, value: null };
    if (!VALID_CATEGORIES.has(trimmed)) return { ok: false, error: 'invalid_category' };
    return { ok: true, value: trimmed };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Allow', 'GET');

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const client = serviceClient();
    if (!client) {
        return res.status(503).json({ success: false, error: 'server_configuration_unavailable' });
    }

    const { user, error: authError } = await getServerUserWithFallback(req, client);
    if (authError || !user?.id) {
        return res.status(401).json({ success: false, error: 'authentication_required' });
    }

    const parsedCategory = parseCategory(req.query?.category);
    if (!parsedCategory.ok) {
        return res.status(400).json({ success: false, error: parsedCategory.error });
    }
    const limit = parseLimit(req.query?.limit);

    try {
        const { data, error } = await client.rpc('trivia_missed_questions_study_v1', {
            p_user_id: user.id,
            p_category: parsedCategory.value,
            p_limit: limit,
        });

        if (error) {
            try { reportApiError(error, { route: '/api/trivia/study-misses', userId: user.id }); } catch (_) {}
            return res.status(500).json({ success: false, error: 'study_deck_unavailable' });
        }

        if (!data || data.success !== true) {
            const code = data?.error || 'study_deck_unavailable';
            const status = code === 'invalid_category' ? 400 : code === 'authentication_required' ? 401 : 500;
            return res.status(status).json({ success: false, error: code });
        }

        const rawItems = Array.isArray(data.items) ? data.items : [];
        const items = rawItems.map((item) => {
            const trainingSpot = getTrainingSpotForCategory(item.category);
            return {
                questionId: item.question_id,
                question: item.question,
                options: Array.isArray(item.options) ? item.options : [],
                correctIndex: Number.isInteger(item.correct_index) ? item.correct_index : 0,
                explanation: typeof item.explanation === 'string' ? item.explanation : '',
                category: item.category,
                categoryLabel: trainingSpot.categoryLabel,
                difficulty: item.difficulty,
                lastMissedAt: item.last_missed_at || null,
                missCount: Number(item.miss_count) || 1,
                trainingSpot: {
                    label: trainingSpot.label,
                    href: trainingSpot.href,
                    specialty: trainingSpot.specialty,
                },
            };
        });

        return res.status(200).json({
            success: true,
            totalMissed: Number(data.total_missed) || 0,
            returned: items.length,
            categoryFilter: data.category_filter || 'all',
            categories: data.categories && typeof data.categories === 'object' ? data.categories : {},
            items,
        });
    } catch (err) {
        try { reportApiError(err, { route: '/api/trivia/study-misses', userId: user.id }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'study_deck_failed' });
    }
}
