/**
 * /admin/trivia-pool - Live trivia question pool dashboard & curation workbench
 *
 * Visualizes per-category pool targets, 90-day eligible supply alerts,
 * Track A/B coverage, Fact-Check Audit, Phase 54 Quality Systems,
 * Batch Curation Queue, and Empirical Difficulty Calibration.
 */
import crypto from 'node:crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAccessToken } from '../../src/lib/authUtils';
import { createClient } from '../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../src/lib/serverAuth';
import { formatQualityIssueLabel } from '../../src/lib/trivia/questionQualityAudit.mjs';
import consoleStyles from '../../src/components/admin/OperatorAdminSurface.module.css';

const ADMIN_POOL_PATH = '/admin/trivia-pool';

async function refreshPoolAccessToken() {
    try {
        const { supabase } = await import('../../src/lib/supabase');
        const { data: refreshed } = await supabase.auth.refreshSession();
        return refreshed?.session?.access_token || null;
    } catch (_err) {
        return null;
    }
}

async function fetchPoolWithTokenRefresh(url, init = {}) {
    let token = getAccessToken();
    if (!token) {
        token = await refreshPoolAccessToken();
    }
    if (!token) {
        return { response: null, unauthenticated: true };
    }
    const buildHeaders = (accessToken) => ({
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`,
    });
    let response = await fetch(url, { ...init, headers: buildHeaders(token) });
    if (response.status === 401) {
        const freshToken = await refreshPoolAccessToken();
        if (freshToken && freshToken !== token) {
            response = await fetch(url, { ...init, headers: buildHeaders(freshToken) });
        }
    }
    return { response, unauthenticated: response.status === 401 };
}

function redirectToPoolLogin() {
    if (typeof window !== 'undefined') {
        window.location.replace('/auth/login?redirect=' + encodeURIComponent(ADMIN_POOL_PATH));
    }
}

function buildCategoryCounts(statusCategories, categoryDepth) {
    const counts = {};
    for (const cat of ALL) {
        counts[cat] = { easy: 0, medium: 0, hard: 0, total: 0 };
    }
    if (statusCategories && typeof statusCategories === 'object') {
        for (const cat of ALL) {
            const row = statusCategories[cat];
            if (row && typeof row === 'object') {
                counts[cat] = {
                    easy: Number(row.easy) || 0,
                    medium: Number(row.medium) || 0,
                    hard: Number(row.hard) || 0,
                    total: Number(row.total) || 0,
                };
            }
        }
        return counts;
    }
    if (Array.isArray(categoryDepth)) {
        for (const row of categoryDepth) {
            if (row?.category && counts[row.category]) {
                counts[row.category].total = Number(row.total_questions ?? row.eligible_count) || 0;
            }
        }
    }
    return counts;
}

const TARGET_PER_CATEGORY = 1500;
const SIXTY_DAY_FLOOR = 1200;
const NINETY_DAY_FLOOR = 1800;
const TRACK_A = ['gto_theory', 'gto_scenarios', 'cash_game_situations', 'mtt_situations', 'icm_chip_ev'];
const TRACK_B = ['poker_history', 'famous_hands', 'player_profiles', 'tournament_facts', 'rule_knowledge'];
const ALL = [...TRACK_A, ...TRACK_B];
const PRETTY = {
    gto_theory: 'GTO Theory',
    gto_scenarios: 'GTO Scenarios',
    cash_game_situations: 'Cash Games',
    mtt_situations: 'MTT Situations',
    icm_chip_ev: 'ICM & Chip EV',
    poker_history: 'Poker History',
    famous_hands: 'Famous Hands',
    player_profiles: 'Player Profiles',
    tournament_facts: 'Tournament Facts',
    rule_knowledge: 'Rules & Etiquette',
};

const WORKBENCH_TABS = [
    { id: 'overview', label: 'Pool Overview' },
    { id: 'curation', label: 'Batch Curation Queue' },
    { id: 'calibration', label: 'Empirical Difficulty Calibration' },
];

const THIN_CATEGORY_PILLS = [
    { id: 'all', label: 'All' },
    { id: 'rule_knowledge', label: 'Rules & Etiquette' },
    { id: 'cash_game_situations', label: 'Cash Game' },
    { id: 'mtt_situations', label: 'MTT Situations' },
    { id: 'icm_chip_ev', label: 'ICM & Chip EV' },
];

function isQualityAuditPass(audit) {
    return Boolean(audit && (audit.passed === true || audit.pass === true));
}

function isCleanPerfectAudit(audit) {
    return isQualityAuditPass(audit) && Number(audit?.score) === 100;
}

function isEditableElement(el) {
    if (!el || typeof el !== 'object') return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable === true) return true;
    return false;
}

export async function getServerSideProps({ req }) {
    const adminSecret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
    const envSecret = typeof process.env.ADMIN_ROUTE_SECRET === 'string' ? process.env.ADMIN_ROUTE_SECRET : '';
    const hasAdminSecret = Boolean(
        envSecret
        && adminSecret
        && Buffer.byteLength(adminSecret) === Buffer.byteLength(envSecret)
        && crypto.timingSafeEqual(Buffer.from(adminSecret), Buffer.from(envSecret))
    );

    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const srKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !srKey) return { props: { error: 'Server misconfigured (missing Supabase env)' } };
    const adm = createClient(url, srKey, { auth: { persistSession: false } });

    if (!hasAdminSecret) {
        const { user, error: uErr } = await getServerUserWithFallback(req, adm);
        if (uErr || !user?.id) {
            return { props: { requiresClientAuth: true } };
        }
        const [{ data: profile }, { data: opContext }] = await Promise.all([
            adm.from('profiles').select('is_admin').eq('id', user.id).maybeSingle(),
            adm.rpc('trivia_operator_context_v1', { p_operator_id: user.id }),
        ]);
        const isOperator = opContext && opContext.allowed === true;
        if (!profile?.is_admin && !isOperator) return { props: { error: 'Forbidden - admin only' } };
    }

    const fetches = ALL.flatMap(cat => ['easy', 'medium', 'hard'].map(diff =>
        adm.from('trivia_questions').select('id', { count: 'exact', head: true }).eq('category', cat).eq('difficulty', diff)
            .then(r => ({ cat, diff, count: r.count || 0 }))
    ));
    const sourceFetches = ['deterministic', 'grok-3-mini', 'legacy_v12', 'cron-generate:grok-3-mini'].map(src =>
        adm.from('trivia_questions').select('id', { count: 'exact', head: true }).eq('source', src)
            .then(r => ({ src, count: r.count || 0 }))
    );
    const nullSourceFetch = adm.from('trivia_questions').select('id', { count: 'exact', head: true }).is('source', null)
        .then(r => ({ src: 'null', count: r.count || 0 }));

    const auditPromises = [
        adm.from('trivia_questions').select('id', { count: 'exact', head: true }).in('source', ['grok-3-mini', 'grok-3', 'cron-generate:grok-3-mini']),
        adm.from('trivia_questions').select('id', { count: 'exact', head: true }).in('source', ['grok-3-mini', 'grok-3', 'cron-generate:grok-3-mini']).not('last_audited_at', 'is', null),
        adm.from('trivia_questions').select('id', { count: 'exact', head: true }).eq('audit_verified', true),
        adm.from('trivia_questions').select('id', { count: 'exact', head: true }).eq('audit_verified', false),
        adm.from('trivia_quality_audits').select('id', { count: 'exact', head: true }).gte('audited_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        adm.from('trivia_quality_audits').select('question_id, audited_at, confidence, reasoning, corrected_answer_text, new_quality_score').eq('verified', false).gte('confidence', 0.7).order('audited_at', { ascending: false }).limit(8),
    ];

    const phase54Promises = [
        adm.from('trivia_category_health').select('category, pass_rate, generation_paused, pause_reason, snapshot_at, audited_count').order('snapshot_at', { ascending: false }).limit(50),
        adm.from('trivia_question_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null),
        adm.from('trivia_question_reports').select('id, question_id, reason, note, created_at').is('resolved_at', null).order('created_at', { ascending: false }).limit(8),
        adm.from('trivia_regression_runs').select('test_name, category, passed, metric, threshold, ran_at, details').gte('ran_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()).eq('passed', false).order('ran_at', { ascending: false }).limit(10),
        adm.from('trivia_questions').select('id', { count: 'exact', head: true }).is('embedding', null),
        adm.from('trivia_questions').select('id', { count: 'exact', head: true }).is('theme', null),
    ];

    const [counts, sources, auditResults, p54Results, calibrationRes] = await Promise.all([
        Promise.all(fetches),
        Promise.all([...sourceFetches, nullSourceFetch]),
        Promise.all(auditPromises),
        Promise.all(phase54Promises),
        adm.rpc('trivia_question_calibration_report_v1', { p_min_shown: 15, p_limit: 100 }),
    ]);

    const audit = {
        grokTotal: auditResults[0].count || 0,
        grokAudited: auditResults[1].count || 0,
        verifiedTrue: auditResults[2].count || 0,
        verifiedFalse: auditResults[3].count || 0,
        auditedLast24h: auditResults[4].count || 0,
        recentFlagged: auditResults[5].data || [],
    };

    const healthByCategory = {};
    for (const row of p54Results[0].data || []) {
        if (!healthByCategory[row.category]) healthByCategory[row.category] = row;
    }
    const phase54 = {
        categoryHealth: Object.values(healthByCategory),
        pausedCategories: Object.values(healthByCategory).filter(h => h.generation_paused),
        unresolvedReportCount: p54Results[1].count || 0,
        recentReports: p54Results[2].data || [],
        recentRegressionFailures: p54Results[3].data || [],
        embeddingBacklog: p54Results[4].count || 0,
        themeBacklog: p54Results[5].count || 0,
    };

    const byCat = {};
    for (const cat of ALL) byCat[cat] = { easy: 0, medium: 0, hard: 0, total: 0 };
    for (const { cat, diff, count } of counts) {
        byCat[cat][diff] = count;
        byCat[cat].total += count;
    }

    const initialCalibration = calibrationRes?.data?.success ? {
        minShown: Number(calibrationRes.data.min_shown) || 15,
        ninetyDayTarget: Number(calibrationRes.data.ninety_day_target_per_category) || NINETY_DAY_FLOOR,
        summary: calibrationRes.data.summary || {},
        outliers: Array.isArray(calibrationRes.data.outliers) ? calibrationRes.data.outliers : [],
        categoryDepth: Array.isArray(calibrationRes.data.category_depth) ? calibrationRes.data.category_depth : [],
    } : null;

    return {
        props: {
            byCat,
            sources,
            audit,
            phase54,
            initialCalibration,
            generatedAt: new Date().toISOString(),
        },
    };
}

function bar(current, target, color) {
    const pct = Math.min(100, Math.round((current / target) * 100));
    return (
        <div style={{ position: 'relative', height: 22, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, transition: 'width 0.3s' }} />
            <div style={{ position: 'relative', textAlign: 'center', lineHeight: '22px', fontSize: 12, fontWeight: 600, color: '#fff', textShadow: '0 0 3px rgba(0,0,0,0.7)' }}>
                {current} / {target}
            </div>
        </div>
    );
}

function CatRow({ catId, counts, track }) {
    const targetEasy = Math.floor(TARGET_PER_CATEGORY * 0.20);
    const targetMedium = Math.floor(TARGET_PER_CATEGORY * 0.50);
    const targetHard = Math.floor(TARGET_PER_CATEGORY * 0.30);
    const trackColor = track === 'A' ? '#4ade80' : '#06b6d4';
    const totalPct = Math.round((counts.total / TARGET_PER_CATEGORY) * 100);
    const belowFloor = counts.total < SIXTY_DAY_FLOOR;
    return (
        <tr style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <td style={{ padding: '12px 12px', fontWeight: 600, color: '#fff' }}>
                <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 4, background: trackColor, marginRight: 8, fontSize: 12, lineHeight: '20px', textAlign: 'center', color: '#000', fontWeight: 700 }}>
                    {track}
                </span>
                {PRETTY[catId]}
            </td>
            <td style={{ padding: '12px 8px', minWidth: 140 }}>{bar(counts.easy, targetEasy, '#86daff')}</td>
            <td style={{ padding: '12px 8px', minWidth: 140 }}>{bar(counts.medium, targetMedium, '#3b82f6')}</td>
            <td style={{ padding: '12px 8px', minWidth: 140 }}>{bar(counts.hard, targetHard, '#4ade80')}</td>
            <td style={{ padding: '12px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: belowFloor ? '#ef4444' : totalPct >= 100 ? '#4ade80' : '#fff' }}>
                {counts.total} / {TARGET_PER_CATEGORY}
                <div style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.72)' }}>
                    {totalPct}%{belowFloor ? ' · below 60-day floor' : ''}
                </div>
            </td>
        </tr>
    );
}

function formatFlagLabel(flag) {
    if (flag === 'easy_too_hard') return 'Easy Too Hard (<35%)';
    if (flag === 'hard_too_easy') return 'Hard Too Easy (>85%)';
    if (flag === 'high_skip_rate') return 'High Skip Rate';
    if (flag === 'high_report_outlier') return 'High Report Outlier';
    return flag;
}

export default function TriviaPoolDashboard({
    byCat = null,
    sources = null,
    audit = null,
    phase54 = null,
    initialCalibration = null,
    generatedAt = null,
    error = null,
    requiresClientAuth = false,
}) {
    const [activeTab, setActiveTab] = useState('overview');
    const [queueMode, setQueueMode] = useState('review_queue');
    const [queueCategory, setQueueCategory] = useState('all');
    const [thinCategoriesFirst, setThinCategoriesFirst] = useState(true);
    const [minShown, setMinShown] = useState(initialCalibration?.minShown || 15);
    const [poolByCat, setPoolByCat] = useState(() => byCat || null);
    const [poolSources] = useState(() => (Array.isArray(sources) ? sources : null));
    const [poolAudit] = useState(() => audit || null);
    const [poolPhase54] = useState(() => phase54 || null);
    const [poolGeneratedAt, setPoolGeneratedAt] = useState(() => generatedAt || null);
    const [poolRecommendations, setPoolRecommendations] = useState([]);
    const [clientLoading, setClientLoading] = useState(() => Boolean(requiresClientAuth && !byCat && !error));
    const [clientError, setClientError] = useState(() => error || '');
    const [workbenchData, setWorkbenchData] = useState(() => (
        initialCalibration ? {
            calibration: {
                minShown: initialCalibration.minShown,
                ninetyDayTarget: initialCalibration.ninetyDayTarget,
                summary: initialCalibration.summary,
                outliers: initialCalibration.outliers,
            },
            categoryDepth: initialCalibration.categoryDepth,
            categoryDepthAlerts: (initialCalibration.categoryDepth || []).filter(r => r.below_90_day_supply),
            queue: { mode: 'review_queue', category: 'all', priority: 'thin_categories', items: [] },
        } : null
    ));
    const [queueLoaded, setQueueLoaded] = useState(false);
    const [workbenchLoading, setWorkbenchLoading] = useState(false);
    const [workbenchError, setWorkbenchError] = useState('');
    const [workbenchAttempted, setWorkbenchAttempted] = useState(false);
    const workbenchAttemptedRef = useRef(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [focusedQueueIndex, setFocusedQueueIndex] = useState(0);
    const [curationReason, setCurationReason] = useState('');
    const [calibrationReason, setCalibrationReason] = useState('Empirical Difficulty Calibration Re-Tier');
    const [actionBusy, setActionBusy] = useState(false);
    const [actionFeedback, setActionFeedback] = useState(null);
    const reasonInputRef = useRef(null);
    const approveBtnRef = useRef(null);
    const quarantineBtnRef = useRef(null);

    useEffect(() => {
        if (!requiresClientAuth || byCat || error) return undefined;
        let cancelled = false;
        (async () => {
            setClientLoading(true);
            setClientError('');
            try {
                const initialParams = new URLSearchParams({
                    queue: 'review_queue',
                    category: 'all',
                    priority: 'thin_categories',
                    minShown: '15',
                    limit: '50',
                });
                const [curateRes, statusRes] = await Promise.all([
                    fetchPoolWithTokenRefresh(`/api/admin/trivia-pool-curate?${initialParams.toString()}`),
                    fetchPoolWithTokenRefresh('/api/admin/trivia-pool-status'),
                ]);
                if (cancelled) return;
                if (curateRes.unauthenticated && statusRes.unauthenticated) {
                    redirectToPoolLogin();
                    return;
                }
                const curatePayload = curateRes.response?.ok
                    ? await curateRes.response.json().catch(() => null)
                    : null;
                const statusPayload = statusRes.response?.ok
                    ? await statusRes.response.json().catch(() => null)
                    : null;
                if (cancelled) return;
                if (!curatePayload?.success && !statusPayload?.categories) {
                    if (curateRes.response?.status === 403 || statusRes.response?.status === 403) {
                        setClientError('Forbidden - Trivia Operator Or Admin Access Required.');
                    } else if (curateRes.unauthenticated) {
                        redirectToPoolLogin();
                        return;
                    } else {
                        setClientError('Unable To Load Trivia Pool Dashboard.');
                    }
                    setClientLoading(false);
                    return;
                }
                if (curatePayload?.success) {
                    setWorkbenchData(curatePayload);
                    setQueueLoaded(true);
                    workbenchAttemptedRef.current = true;
                    setWorkbenchAttempted(true);
                }
                const nextByCat = buildCategoryCounts(
                    statusPayload?.categories || null,
                    curatePayload?.categoryDepth || null,
                );
                setPoolByCat(nextByCat);
                setPoolRecommendations(Array.isArray(statusPayload?.recommendations) ? statusPayload.recommendations : []);
                setPoolGeneratedAt(curatePayload?.generatedAt || new Date().toISOString());
                setClientLoading(false);
            } catch (_err) {
                if (!cancelled) {
                    setClientError('Unable To Load Trivia Pool Dashboard.');
                    setClientLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [byCat, error, requiresClientAuth]);

    const loadWorkbench = useCallback(async ({
        mode = queueMode,
        category = queueCategory,
        min = minShown,
        thinFirst = thinCategoriesFirst,
    } = {}) => {
        workbenchAttemptedRef.current = true;
        setWorkbenchAttempted(true);
        setWorkbenchLoading(true);
        setWorkbenchError('');
        try {
            const params = new URLSearchParams({
                queue: mode,
                category,
                priority: thinFirst ? 'thin_categories' : 'default',
                minShown: String(min),
                limit: '50',
            });
            const { response: resp, unauthenticated } = await fetchPoolWithTokenRefresh(`/api/admin/trivia-pool-curate?${params.toString()}`);
            if (unauthenticated || !resp) {
                redirectToPoolLogin();
                return;
            }
            const payload = await resp.json().catch(() => null);
            if (!resp.ok || !payload?.success) {
                setWorkbenchError(payload?.error || 'Unable To Load Pool Curation Workbench');
                setWorkbenchLoading(false);
                return;
            }
            setWorkbenchData(payload);
            setQueueLoaded(true);
            setSelectedIds([]);
        } catch (_err) {
            setWorkbenchError('Unable To Load Pool Curation Workbench');
        } finally {
            setWorkbenchLoading(false);
        }
    }, [minShown, queueCategory, queueMode, thinCategoriesFirst]);

    useEffect(() => {
        if ((activeTab === 'curation' || activeTab === 'calibration') && !queueLoaded && !workbenchAttempted && !workbenchAttemptedRef.current) {
            workbenchAttemptedRef.current = true;
            setWorkbenchAttempted(true);
            loadWorkbench();
        }
    }, [activeTab, loadWorkbench, queueLoaded, workbenchAttempted]);

    const runBatchCurate = async ({ questionIds, action, reason }) => {
        const trimmedReason = String(reason || '').trim();
        if (!Array.isArray(questionIds) || questionIds.length === 0) {
            setActionFeedback({ kind: 'error', text: 'Select At Least One Question First.' });
            return;
        }
        if (trimmedReason.length < 8) {
            setActionFeedback({ kind: 'error', text: 'Enter An Audit Reason (At Least 8 Characters).' });
            return;
        }
        setActionBusy(true);
        setActionFeedback(null);
        try {
            const { response: resp, unauthenticated } = await fetchPoolWithTokenRefresh('/api/admin/trivia-pool-curate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questionIds,
                    action,
                    reason: trimmedReason,
                }),
            });
            if (unauthenticated || !resp) {
                redirectToPoolLogin();
                return;
            }
            const payload = await resp.json().catch(() => null);
            if (resp.status === 403 && payload?.requiresMfa === true) {
                setActionFeedback({
                    kind: 'mfa',
                    text: payload?.requiresEnrollment === true
                        ? 'MFA Enrollment Required: Enroll An Authenticator Before Submitting Pool Curation Writes.'
                        : (payload?.error || 'MFA Verification Required Before Submitting Pool Curation Writes.'),
                    requiresEnrollment: payload?.requiresEnrollment === true,
                    stepUpUrl: payload?.requiresEnrollment === true
                        ? '/auth/mfa?enroll=1&next=%2Fadmin%2Ftrivia-pool'
                        : '/auth/mfa?stepup=1&next=%2Fadmin%2Ftrivia-pool',
                });
                setActionBusy(false);
                return;
            }
            if (!resp.ok || !payload?.success) {
                setActionFeedback({
                    kind: 'error',
                    text: `Batch Action Rejected: ${payload?.error || 'curation_failed'}`,
                });
                setActionBusy(false);
                return;
            }
            setActionFeedback({
                kind: 'success',
                text: `Action ${payload.action} Applied To ${payload.affectedCount} Question(s). Receipt ${String(payload.receiptId || '')}`,
            });
            setSelectedIds([]);
            try {
                await loadWorkbench();
            } catch (_refreshError) {
                // Keep the confirmed curation receipt visible even if the follow-up workbench refresh fails.
            }
        } catch (_err) {
            setActionFeedback({ kind: 'error', text: 'Batch Curation Request Failed.' });
        } finally {
            setActionBusy(false);
        }
    };

    const queueItems = useMemo(() => workbenchData?.queue?.items || [], [workbenchData]);
    const calibrationOutliers = useMemo(() => workbenchData?.calibration?.outliers || [], [workbenchData]);
    const calibrationSummary = useMemo(() => workbenchData?.calibration?.summary || {}, [workbenchData]);
    const categoryDepthAlerts = useMemo(() => workbenchData?.categoryDepthAlerts || [], [workbenchData]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    const toggleSelectId = useCallback((id) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    }, []);

    const toggleSelectAll = () => {
        if (selectedIds.length === queueItems.length && queueItems.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(queueItems.map((item) => item.questionId));
        }
    };

    const selectReadyOnly = () => {
        setSelectedIds(
            queueItems
                .filter((item) => isQualityAuditPass(item.qualityAudit))
                .map((item) => item.questionId)
        );
    };

    const selectTop10Clean = () => {
        const cleanIds = queueItems
            .filter((item) => isCleanPerfectAudit(item.qualityAudit))
            .slice(0, 10)
            .map((item) => item.questionId);
        setSelectedIds(cleanIds);
        if (cleanIds.length > 0 && reasonInputRef.current) {
            reasonInputRef.current.focus();
        }
    };

    const readyQueueCount = useMemo(
        () => queueItems.filter((item) => isQualityAuditPass(item.qualityAudit)).length,
        [queueItems]
    );

    const clean100Count = useMemo(
        () => queueItems.filter((item) => isCleanPerfectAudit(item.qualityAudit)).length,
        [queueItems]
    );

    const safeFocusedIndex = queueItems.length > 0
        ? Math.min(Math.max(focusedQueueIndex, 0), queueItems.length - 1)
        : 0;

    useEffect(() => {
        if (activeTab !== 'curation' || typeof window === 'undefined') return undefined;

        const handleCurationKeyDown = (event) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (isEditableElement(document.activeElement) || isEditableElement(event.target)) return;
            if (queueItems.length === 0) return;

            const key = String(event.key || '');
            const lower = key.toLowerCase();

            if (lower === 'j') {
                event.preventDefault();
                setFocusedQueueIndex((prev) => Math.min(queueItems.length - 1, prev + 1));
                return;
            }
            if (lower === 'k') {
                event.preventDefault();
                setFocusedQueueIndex((prev) => Math.max(0, prev - 1));
                return;
            }
            if (key === ' ' || event.code === 'Space') {
                event.preventDefault();
                const focusedItem = queueItems[safeFocusedIndex];
                if (focusedItem?.questionId) {
                    toggleSelectId(focusedItem.questionId);
                }
                return;
            }

            const triggerWithReasonGuard = (action, buttonRef) => {
                event.preventDefault();
                if (actionBusy) return;
                if (selectedIds.length === 0) {
                    setActionFeedback({ kind: 'error', text: 'Select At Least One Question First.' });
                    return;
                }
                if (curationReason.trim().length < 8) {
                    setActionFeedback({ kind: 'error', text: 'Enter An Audit Reason (At Least 8 Characters).' });
                    if (reasonInputRef.current) reasonInputRef.current.focus();
                    return;
                }
                if (buttonRef?.current) buttonRef.current.focus();
                runBatchCurate({ questionIds: selectedIds, action, reason: curationReason });
            };

            if (lower === 'a') {
                triggerWithReasonGuard('approve', approveBtnRef);
                return;
            }
            if (lower === 'q') {
                triggerWithReasonGuard('quarantine', quarantineBtnRef);
                return;
            }
            if (key === '1') {
                triggerWithReasonGuard('set_difficulty_easy', null);
                return;
            }
            if (key === '2') {
                triggerWithReasonGuard('set_difficulty_medium', null);
                return;
            }
            if (key === '3') {
                triggerWithReasonGuard('set_difficulty_hard', null);
            }
        };

        window.addEventListener('keydown', handleCurationKeyDown);
        return () => window.removeEventListener('keydown', handleCurationKeyDown);
    }, [actionBusy, activeTab, curationReason, queueItems, safeFocusedIndex, selectedIds, toggleSelectId]);

    if (clientLoading) {
        return <main className={`smarterdesign ${consoleStyles.surface}`}><div className={consoleStyles.state} role="status" style={{ padding: 24 }}>Loading Trivia Pool Dashboard...</div></main>;
    }

    if (clientError) {
        return <main className={`smarterdesign ${consoleStyles.surface}`}><div className={consoleStyles.state} role="alert" style={{ padding: 24, color: '#ff7a7a' }}>Error: {clientError}</div></main>;
    }

    const activeByCat = poolByCat || buildCategoryCounts(null, workbenchData?.categoryDepth || null);
    const emptyCounts = { easy: 0, medium: 0, hard: 0, total: 0 };
    const totalCount = ALL.reduce((s, c) => s + (activeByCat[c]?.total || 0), 0);
    const targetTotal = ALL.length * TARGET_PER_CATEGORY;
    const overallPct = Math.round((totalCount / targetTotal) * 100);
    const trackATotal = TRACK_A.reduce((s, c) => s + (activeByCat[c]?.total || 0), 0);
    const trackBTotal = TRACK_B.reduce((s, c) => s + (activeByCat[c]?.total || 0), 0);
    const displayGeneratedAt = poolGeneratedAt || new Date().toISOString();

    return (
        <main className={`smarterdesign ${consoleStyles.surface}`} style={{ background: '#040d18', minHeight: '100vh', color: '#f2f7ff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div style={{ maxWidth: 1140, margin: '0 auto' }}>
                <div className={consoleStyles.responsiveGrid} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                    <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#f2f7ff' }}>Trivia Pool Dashboard</h1>
                    <div style={{ fontSize: 12, color: '#bdd0e2' }}>
                        Generated {new Date(displayGeneratedAt).toLocaleString()} · <a href="/admin/trivia-pool" style={{ color: '#86daff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, padding: '0 8px' }}>Reload</a>
                    </div>
                </div>
                <div style={{ color: '#bdd0e2', fontSize: 14, marginBottom: 18 }}>
                    Phase 49 Target: 1,500 Per Category · 60-Day Floor: 1,200 · 90-Day Supply Alert: 1,800 Eligible · 20/50/30 Easy/Medium/Hard Mix
                </div>

                {/* Category Depth Alerts (Below 90-Day Supply) */}
                {categoryDepthAlerts.length > 0 && (
                    <section
                        className={`sd-panel ${consoleStyles.panel}`}
                        role="status"
                        aria-label="Category Depth Alerts Below 90-Day Supply"
                        style={{ padding: 16, marginBottom: 20, border: '1px solid rgba(134, 218, 255, 0.45)', background: 'rgba(12, 85, 192, 0.14)' }}
                    >
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#86daff', marginBottom: 8 }}>
                            Category Depth Alerts: {categoryDepthAlerts.length} Categories Below 90-Day Supply ({NINETY_DAY_FLOOR.toLocaleString()} Eligible)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                            {categoryDepthAlerts.map((alertRow) => (
                                <div key={alertRow.category} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(4, 13, 24, 0.65)', border: '1px solid rgba(134, 218, 255, 0.28)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f2f7ff' }}>{PRETTY[alertRow.category] || alertRow.category}</div>
                                    <div style={{ fontSize: 12, color: '#86daff' }}>
                                        {Number(alertRow.eligible_count || 0).toLocaleString()} Eligible ({alertRow.days_of_supply}d Supply)
                                    </div>
                                    <div style={{ fontSize: 12, color: '#bdd0e2' }}>
                                        Shortfall {Number(alertRow.shortfall_90_day || 0).toLocaleString()} · Queue {Number(alertRow.review_queue_count || 0).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Workbench Tab Bar */}
                <div className="sd-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }} role="tablist" aria-label="Trivia Pool Workbench Views">
                    {WORKBENCH_TABS.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                aria-pressed={isActive}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    minHeight: 44,
                                    padding: '10px 16px',
                                    borderRadius: 8,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    border: isActive ? '1px solid #86daff' : '1px solid rgba(189, 208, 226, 0.28)',
                                    background: isActive ? 'rgba(12, 85, 192, 0.45)' : 'rgba(10, 24, 41, 0.72)',
                                    color: isActive ? '#f2f7ff' : '#bdd0e2',
                                }}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {actionFeedback && (
                    <div
                        role={actionFeedback.kind === 'error' || actionFeedback.kind === 'mfa' ? 'alert' : 'status'}
                        data-mfa-stepup-required={actionFeedback.kind === 'mfa' ? 'true' : undefined}
                        style={{
                            padding: '12px 14px',
                            marginBottom: 18,
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            background: actionFeedback.kind === 'mfa'
                                ? 'rgba(12, 85, 192, 0.22)'
                                : (actionFeedback.kind === 'error' ? 'rgba(239,68,68,0.16)' : 'rgba(74, 222, 128,0.16)'),
                            border: `1px solid ${actionFeedback.kind === 'mfa'
                                ? 'rgba(134, 218, 255, 0.55)'
                                : (actionFeedback.kind === 'error' ? 'rgba(239,68,68,0.45)' : 'rgba(74, 222, 128,0.45)')}`,
                            color: actionFeedback.kind === 'mfa'
                                ? '#f2f7ff'
                                : (actionFeedback.kind === 'error' ? '#fecaca' : '#bbf7d0'),
                        }}
                    >
                        <span>{actionFeedback.text}</span>
                        {actionFeedback.kind === 'mfa' && (
                            <a
                                href={actionFeedback.stepUpUrl || '/auth/mfa?stepup=1&next=%2Fadmin%2Ftrivia-pool'}
                                className="sd-button"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    minHeight: 44,
                                    padding: '8px 14px',
                                    borderRadius: 6,
                                    border: '1px solid #86daff',
                                    background: '#0c55c0',
                                    color: '#f2f7ff',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                }}
                            >
                                {actionFeedback.requiresEnrollment ? 'Enroll MFA' : 'Verify MFA Session'}
                            </a>
                        )}
                    </div>
                )}

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <>
                        <div className={consoleStyles.responsiveGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
                            <Card title="Pool Total" value={`${totalCount.toLocaleString()} / ${targetTotal.toLocaleString()}`} subtitle={`${overallPct}% complete`} color={overallPct >= 100 ? '#4ade80' : overallPct >= 50 ? '#86daff' : '#ef4444'} />
                            <Card title="Track A (Deterministic)" value={`${trackATotal.toLocaleString()} / 7,500`} subtitle={`${Math.round((trackATotal / 7500) * 100)}% - solver-grounded`} color="#4ade80" />
                            <Card title="Track B (Grok-3-Mini)" value={`${trackBTotal.toLocaleString()} / 7,500`} subtitle={`${Math.round((trackBTotal / 7500) * 100)}% - fact-verified`} color="#86daff" />
                        </div>

                        <div className={consoleStyles.tableWell} tabIndex={0} role="region" aria-label="Trivia Questions By Category" style={{ marginBottom: 24 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <th style={{ padding: '12px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>CATEGORY</th>
                                        <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>EASY (300)</th>
                                        <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>MEDIUM (750)</th>
                                        <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>HARD (450)</th>
                                        <th style={{ padding: '12px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {TRACK_A.map(cat => <CatRow key={cat} catId={cat} counts={activeByCat[cat] || emptyCounts} track="A" />)}
                                    <tr><td colSpan={5} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', fontSize: 12, color: 'rgba(255,255,255,0.72)', letterSpacing: 0.5 }}>TRACK B</td></tr>
                                    {TRACK_B.map(cat => <CatRow key={cat} catId={cat} counts={activeByCat[cat] || emptyCounts} track="B" />)}
                                </tbody>
                            </table>
                        </div>

                        {poolRecommendations.length > 0 && (
                            <div className={consoleStyles.panel} style={{ padding: 20, marginBottom: 24 }}>
                                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, margin: '0 0 12px 0' }}>POOL RECOMMENDATIONS</h3>
                                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 13, color: 'rgba(255,255,255,0.86)' }}>
                                    {poolRecommendations.map((rec, idx) => (
                                        <li key={idx}>{rec}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {poolSources && poolSources.length > 0 && (
                            <div className={consoleStyles.panel} style={{ padding: 20, marginBottom: 24 }}>
                                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, margin: '0 0 12px 0' }}>SOURCE MIX</h3>
                                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                                    {poolSources.map(({ src, count }) => (
                                        <div key={src} style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{src === 'null' ? 'Unset (Legacy)' : src}</span>
                                            <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{count.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {poolAudit && (
                            <div className={consoleStyles.panel} style={{ padding: 20, marginBottom: 24 }}>
                                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, margin: '0 0 12px 0' }}>FACT-CHECK AUDIT (Track B Only)</h3>
                                <div className={consoleStyles.responsiveGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 16 }}>
                                    <Card title="Grok Questions" value={poolAudit.grokTotal.toLocaleString()} subtitle="Track B total" color="#86daff" />
                                    <Card title="Audited" value={`${poolAudit.grokAudited.toLocaleString()} / ${poolAudit.grokTotal.toLocaleString()}`} subtitle={`${poolAudit.grokTotal > 0 ? Math.round((poolAudit.grokAudited / poolAudit.grokTotal) * 100) : 0}% reviewed`} color="#bdd0e2" />
                                    <Card title="Verified" value={poolAudit.verifiedTrue.toLocaleString()} subtitle="quality_score = 9" color="#4ade80" />
                                    <Card title="Flagged" value={poolAudit.verifiedFalse.toLocaleString()} subtitle="quality_score = 2 (excluded)" color="#ef4444" />
                                    <Card title="Last 24h" value={poolAudit.auditedLast24h.toLocaleString()} subtitle="reviewed today" color="#86daff" />
                                </div>
                                {poolAudit.recentFlagged.length > 0 && (
                                    <>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8, marginTop: 4 }}>RECENT FLAGGED - Needs Human Review</div>
                                        <div style={{ background: 'rgba(239,68,68,0.04)', borderRadius: 8, overflow: 'hidden' }}>
                                            {poolAudit.recentFlagged.map((f, i) => (
                                                <div key={i} style={{ padding: '10px 12px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: 12 }}>
                                                    <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                                                        <span style={{ color: '#ef4444', fontWeight: 600 }}>Conf {Math.round(f.confidence * 100)}%</span>
                                                        <span style={{ color: 'rgba(255,255,255,0.72)' }}>{new Date(f.audited_at).toLocaleString()}</span>
                                                        <code style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{f.question_id.slice(0, 8)}</code>
                                                    </div>
                                                    <div style={{ color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>{f.reasoning}</div>
                                                    {f.corrected_answer_text && (
                                                        <div style={{ marginTop: 4, color: '#65e8aa', fontSize: 12 }}>
                                                            Suggested Correct Answer: <strong>{f.corrected_answer_text}</strong>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {poolPhase54 && (
                            <div className={consoleStyles.panel} style={{ padding: 20, marginBottom: 24 }}>
                                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, margin: '0 0 12px 0' }}>QUALITY SYSTEMS (Phase 54)</h3>
                                <div className={consoleStyles.responsiveGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
                                    <Card title="Paused Categories" value={poolPhase54.pausedCategories.length.toString()} subtitle={poolPhase54.pausedCategories.length === 0 ? 'all generating' : poolPhase54.pausedCategories.map(c => c.category).join(', ').slice(0, 40)} color={poolPhase54.pausedCategories.length > 0 ? '#ef4444' : '#4ade80'} />
                                    <Card title="Open Reports" value={poolPhase54.unresolvedReportCount.toString()} subtitle="users flagged" color={poolPhase54.unresolvedReportCount > 0 ? '#86daff' : '#4ade80'} />
                                    <Card title="Regression Failures" value={poolPhase54.recentRegressionFailures.length.toString()} subtitle="last 48h" color={poolPhase54.recentRegressionFailures.length > 0 ? '#ef4444' : '#4ade80'} />
                                    <Card title="Embedding Backlog" value={poolPhase54.embeddingBacklog.toLocaleString()} subtitle="questions un-embedded" color="#86daff" />
                                    <Card title="Theme Backlog" value={poolPhase54.themeBacklog.toLocaleString()} subtitle="questions un-tagged" color="#bdd0e2" />
                                </div>

                                {poolPhase54.categoryHealth.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>CIRCUIT BREAKER - Per-Category Audit Pass Rate</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                                            {poolPhase54.categoryHealth.map(h => (
                                                <div key={h.category} style={{ padding: '8px 10px', borderRadius: 6, background: h.generation_paused ? 'rgba(239,68,68,0.12)' : 'rgba(74, 222, 128,0.06)', border: '1px solid ' + (h.generation_paused ? 'rgba(239,68,68,0.3)' : 'rgba(74, 222, 128,0.15)') }}>
                                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{h.category}</div>
                                                    <div style={{ fontSize: 14, fontWeight: 600, color: h.generation_paused ? '#ef4444' : '#4ade80' }}>
                                                        {h.pass_rate !== null ? Math.round(h.pass_rate * 100) + '%' : 'no data'}
                                                        {h.generation_paused && <span style={{ marginLeft: 6, fontSize: 12, color: '#ff7a7a' }}>PAUSED</span>}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>N={h.audited_count}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {poolPhase54.recentReports.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>RECENT USER REPORTS</div>
                                        <div style={{ background: 'rgba(134, 218, 255, 0.06)', borderRadius: 8, overflow: 'hidden' }}>
                                            {poolPhase54.recentReports.map((r, i) => (
                                                <div key={r.id} style={{ padding: '8px 12px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: 12 }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                                        <span style={{ color: '#86daff', fontWeight: 600, minWidth: 100 }}>{r.reason}</span>
                                                        <code style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{r.question_id.slice(0, 8)}</code>
                                                        <span style={{ color: 'rgba(255,255,255,0.72)', marginLeft: 'auto' }}>{new Date(r.created_at).toLocaleString()}</span>
                                                    </div>
                                                    {r.note && <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.7)' }}>"{r.note}"</div>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {poolPhase54.recentRegressionFailures.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>REGRESSION TEST FAILURES - Last 48h</div>
                                        <div style={{ background: 'rgba(239,68,68,0.04)', borderRadius: 8, overflow: 'hidden' }}>
                                            {poolPhase54.recentRegressionFailures.map((f, i) => (
                                                <div key={i} style={{ padding: '8px 12px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{f.test_name}</span>
                                                    {f.category && <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.72)' }}>{f.category}</span>}
                                                    <span style={{ marginLeft: 8 }}>Metric {f.metric} (Threshold {f.threshold})</span>
                                                    <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{new Date(f.ran_at).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 12, padding: 16, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>How The Refill Works</div>
                            <div style={{ lineHeight: 1.6 }}>
                                Every 4 Hours, The Openclaw Dispatcher Fires <code style={{ background: 'rgba(0,0,0,0.4)', padding: '1px 5px', borderRadius: 3 }}>{'/cron/generate-trivia-questions'}</code> On
                                The Workers VM. The Handler Picks The Most-Undertarget Bucket, Runs Track A (Deterministic, Free) For Strategy
                                Categories Or Track B (Grok-3-Mini, ~$0.002 Per Batch) For Fact Categories, And Inserts Directly Into
                                <code style={{ background: 'rgba(0,0,0,0.4)', padding: '1px 5px', borderRadius: 3, margin: '0 4px' }}>{'trivia_questions'}</code>.
                                At ~30 Questions Per Tick × 6 Ticks/Day, The Pool Fills In ~5-6 Weeks At Well Under $20 Total Grok Spend.
                            </div>
                        </div>
                    </>
                )}

                {/* Batch Curation Queue Tab */}
                {activeTab === 'curation' && (
                    <section className={consoleStyles.panel} style={{ padding: 20 }} aria-label="Batch Curation Queue">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Batch Curation Queue</h2>
                            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    aria-pressed={queueMode === 'review_queue'}
                                    onClick={() => {
                                        setQueueMode('review_queue');
                                        loadWorkbench({ mode: 'review_queue', category: queueCategory, min: minShown, thinFirst: thinCategoriesFirst });
                                    }}
                                    style={{
                                        padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                        border: '1px solid rgba(255,255,255,0.22)',
                                        background: queueMode === 'review_queue' ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.06)',
                                        color: '#fff',
                                    }}
                                >
                                    Review Queue ({Number(calibrationSummary.total_review_queue || 0).toLocaleString()})
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={queueMode === 'unaudited'}
                                    onClick={() => {
                                        setQueueMode('unaudited');
                                        loadWorkbench({ mode: 'unaudited', category: queueCategory, min: minShown, thinFirst: thinCategoriesFirst });
                                    }}
                                    style={{
                                        padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                        border: '1px solid rgba(255,255,255,0.22)',
                                        background: queueMode === 'unaudited' ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.06)',
                                        color: '#fff',
                                    }}
                                >
                                    Un-Audited ({Number(calibrationSummary.total_unaudited || 0).toLocaleString()})
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={thinCategoriesFirst}
                                    onClick={() => {
                                        const nextThin = !thinCategoriesFirst;
                                        setThinCategoriesFirst(nextThin);
                                        loadWorkbench({ mode: queueMode, category: queueCategory, min: minShown, thinFirst: nextThin });
                                    }}
                                    style={{
                                        minHeight: 44, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                        border: thinCategoriesFirst ? '1px solid #86daff' : '1px solid rgba(255,255,255,0.22)',
                                        background: thinCategoriesFirst ? 'rgba(12, 85, 192, 0.42)' : 'rgba(255,255,255,0.06)',
                                        color: thinCategoriesFirst ? '#f2f7ff' : '#bdd0e2',
                                    }}
                                >
                                    Thin Categories First
                                </button>
                                <select
                                    aria-label="Filter Curation Category"
                                    value={queueCategory}
                                    onChange={(e) => {
                                        const nextCat = e.target.value;
                                        setQueueCategory(nextCat);
                                        loadWorkbench({ mode: queueMode, category: nextCat, min: minShown, thinFirst: thinCategoriesFirst });
                                    }}
                                    style={{
                                        padding: '8px 10px', borderRadius: 6, fontSize: 12,
                                        background: '#111827', color: '#fff', border: '1px solid rgba(255,255,255,0.22)',
                                    }}
                                >
                                    <option value="all">All Categories</option>
                                    {ALL.map((cat) => (
                                        <option key={cat} value={cat}>{PRETTY[cat]}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => loadWorkbench()}
                                    disabled={workbenchLoading}
                                    style={{
                                        padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                        background: 'rgba(255,255,255,0.09)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)',
                                    }}
                                >
                                    {workbenchLoading ? 'Refreshing' : 'Refresh Queue'}
                                </button>
                            </div>
                        </div>

                        {/* Thin-Category Quick Filter Pills */}
                        <div
                            role="group"
                            aria-label="Thin-Category Quick Filters"
                            data-thin-category-filters="true"
                            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}
                        >
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#bdd0e2', marginRight: 4 }}>
                                Thin-Category Quick Filter:
                            </span>
                            {THIN_CATEGORY_PILLS.map((pill) => {
                                const isActive = queueCategory === pill.id;
                                return (
                                    <button
                                        key={pill.id}
                                        type="button"
                                        aria-pressed={isActive}
                                        data-thin-category-pill={pill.id}
                                        onClick={() => {
                                            setQueueCategory(pill.id);
                                            setFocusedQueueIndex(0);
                                            loadWorkbench({ mode: queueMode, category: pill.id, min: minShown, thinFirst: thinCategoriesFirst });
                                        }}
                                        style={{
                                            minHeight: 44,
                                            padding: '8px 14px',
                                            borderRadius: 999,
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            border: isActive ? '1px solid #86daff' : '1px solid rgba(189, 208, 226, 0.28)',
                                            background: isActive ? 'rgba(12, 85, 192, 0.45)' : 'rgba(10, 24, 41, 0.72)',
                                            color: isActive ? '#f2f7ff' : '#bdd0e2',
                                        }}
                                    >
                                        {pill.label}
                                    </button>
                                );
                            })}
                        </div>

                        {workbenchError && (
                            <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, marginBottom: 14, borderRadius: 8, background: 'rgba(239,68,68,0.14)', color: '#fecaca', fontSize: 13 }}>
                                <span>{workbenchError}</span>
                                <button
                                    type="button"
                                    disabled={workbenchLoading}
                                    onClick={() => loadWorkbench()}
                                    style={{ minHeight: 44, padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(239,68,68,0.28)', color: '#fff', border: '1px solid rgba(239,68,68,0.55)' }}
                                >
                                    Retry
                                </button>
                            </div>
                        )}

                        {/* Batch action controls */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: 12, marginBottom: 12, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#86daff' }}>
                                Selected: {selectedIds.length} / {queueItems.length} · Ready: {readyQueueCount} · Clean 100/100: {clean100Count}
                            </span>
                            <button
                                type="button"
                                data-select-top-clean="true"
                                disabled={actionBusy || clean100Count === 0}
                                onClick={selectTop10Clean}
                                style={{ minHeight: 44, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(12, 85, 192, 0.42)', color: '#f2f7ff', border: '1px solid #86daff' }}
                            >
                                Select Top 10 Clean (100/100)
                            </button>
                            <button
                                type="button"
                                disabled={actionBusy || readyQueueCount === 0}
                                onClick={selectReadyOnly}
                                style={{ minHeight: 44, padding: '8px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(74, 222, 128,0.18)', color: '#bbf7d0', border: '1px solid rgba(74, 222, 128,0.45)' }}
                            >
                                Select Ready Only
                            </button>
                            <input
                                ref={reasonInputRef}
                                type="text"
                                aria-label="Batch Curation Reason"
                                placeholder="Required Audit Reason (Min 8 Characters)"
                                value={curationReason}
                                onChange={(e) => setCurationReason(e.target.value)}
                                style={{
                                    flex: '1 1 260px', minHeight: 44, padding: '8px 10px', borderRadius: 6, fontSize: 13,
                                    background: '#0b1020', color: '#fff', border: '1px solid rgba(255,255,255,0.22)',
                                }}
                            />
                            <button
                                ref={approveBtnRef}
                                type="button"
                                disabled={actionBusy || selectedIds.length === 0}
                                onClick={() => runBatchCurate({ questionIds: selectedIds, action: 'approve', reason: curationReason })}
                                style={{ minHeight: 44, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#166534', color: '#fff', border: '1px solid rgba(74, 222, 128, 0.55)' }}
                            >
                                Approve Selected
                            </button>
                            <button
                                ref={quarantineBtnRef}
                                type="button"
                                disabled={actionBusy || selectedIds.length === 0}
                                onClick={() => runBatchCurate({ questionIds: selectedIds, action: 'quarantine', reason: curationReason })}
                                style={{ minHeight: 44, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#991b1b', color: '#fff', border: '1px solid #ef4444' }}
                            >
                                Quarantine Selected
                            </button>
                            <button
                                type="button"
                                disabled={actionBusy || selectedIds.length === 0}
                                onClick={() => runBatchCurate({ questionIds: selectedIds, action: 'set_difficulty_easy', reason: curationReason })}
                                style={{ minHeight: 44, padding: '8px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(134, 218, 255, 0.16)', color: '#f2f7ff', border: '1px solid rgba(134, 218, 255, 0.45)' }}
                            >
                                Re-Tier Easy
                            </button>
                            <button
                                type="button"
                                disabled={actionBusy || selectedIds.length === 0}
                                onClick={() => runBatchCurate({ questionIds: selectedIds, action: 'set_difficulty_medium', reason: curationReason })}
                                style={{ minHeight: 44, padding: '8px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(12, 85, 192, 0.34)', color: '#f2f7ff', border: '1px solid rgba(134, 218, 255, 0.45)' }}
                            >
                                Re-Tier Medium
                            </button>
                            <button
                                type="button"
                                disabled={actionBusy || selectedIds.length === 0}
                                onClick={() => runBatchCurate({ questionIds: selectedIds, action: 'set_difficulty_hard', reason: curationReason })}
                                style={{ minHeight: 44, padding: '8px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(74, 222, 128, 0.18)', color: '#f2f7ff', border: '1px solid rgba(74, 222, 128, 0.45)' }}
                            >
                                Re-Tier Hard
                            </button>
                        </div>

                        {/* Keyboard Shortcuts Legend */}
                        <div
                            data-curation-shortcuts-legend="true"
                            aria-label="Keyboard Curation Shortcuts"
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 10,
                                alignItems: 'center',
                                padding: '8px 12px',
                                marginBottom: 14,
                                borderRadius: 8,
                                background: 'rgba(10, 24, 41, 0.72)',
                                border: '1px solid rgba(134, 218, 255, 0.24)',
                                fontSize: 12,
                                color: '#bdd0e2',
                            }}
                        >
                            <span style={{ fontWeight: 700, color: '#f2f7ff' }}>Keyboard Shortcuts:</span>
                            <span><kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(189,208,226,0.3)', color: '#f2f7ff', fontSize: 12 }}>J</kbd> / <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(189,208,226,0.3)', color: '#f2f7ff', fontSize: 12 }}>K</kbd> Move Focus</span>
                            <span><kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(189,208,226,0.3)', color: '#f2f7ff', fontSize: 12 }}>Space</kbd> Toggle Select</span>
                            <span><kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(189,208,226,0.3)', color: '#f2f7ff', fontSize: 12 }}>A</kbd> Approve Selected</span>
                            <span><kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(189,208,226,0.3)', color: '#f2f7ff', fontSize: 12 }}>Q</kbd> Quarantine</span>
                            <span><kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(189,208,226,0.3)', color: '#f2f7ff', fontSize: 12 }}>1</kbd> / <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(189,208,226,0.3)', color: '#f2f7ff', fontSize: 12 }}>2</kbd> / <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(189,208,226,0.3)', color: '#f2f7ff', fontSize: 12 }}>3</kbd> Easy / Medium / Hard</span>
                        </div>

                        {workbenchLoading ? (
                            <div role="status" style={{ padding: 20, fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Loading Curation Queue</div>
                        ) : queueItems.length === 0 ? (
                            <div role="status" style={{ padding: 20, fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>No Questions Match The Selected Queue Filter.</div>
                        ) : (
                            <div className={consoleStyles.tableWell} tabIndex={0} role="region" aria-label="Curation Queue Questions">
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                            <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 12, width: 56 }}>
                                                <button
                                                    type="button"
                                                    role="checkbox"
                                                    aria-checked={queueItems.length > 0 && selectedIds.length === queueItems.length}
                                                    aria-label="Select All Questions"
                                                    className="sd-button"
                                                    onClick={toggleSelectAll}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        minWidth: 44,
                                                        minHeight: 44,
                                                        width: 44,
                                                        height: 44,
                                                        padding: 0,
                                                        borderRadius: 8,
                                                        background: queueItems.length > 0 && selectedIds.length === queueItems.length ? 'rgba(25, 129, 236, 0.36)' : 'rgba(10, 24, 41, 0.9)',
                                                        border: queueItems.length > 0 && selectedIds.length === queueItems.length ? '1px solid #86daff' : '1px solid rgba(189, 208, 226, 0.35)',
                                                        color: '#f2f7ff',
                                                        fontSize: 16,
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        style={{
                                                            display: 'inline-block',
                                                            width: 16,
                                                            height: 16,
                                                            borderRadius: 4,
                                                            border: queueItems.length > 0 && selectedIds.length === queueItems.length
                                                                ? '2px solid #86daff'
                                                                : '2px solid rgba(189, 208, 226, 0.55)',
                                                            background: queueItems.length > 0 && selectedIds.length === queueItems.length
                                                                ? '#1981ec'
                                                                : 'transparent',
                                                            boxShadow: queueItems.length > 0 && selectedIds.length === queueItems.length
                                                                ? 'inset 0 0 0 2px #0a1829'
                                                                : 'none',
                                                        }}
                                                    />
                                                </button>
                                            </th>
                                            <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>CATEGORY</th>
                                            <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>DIFFICULTY</th>
                                            <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>QUALITY</th>
                                            <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>PRE-CHECK</th>
                                            <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>QUESTION</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {queueItems.map((item, idx) => {
                                            const isFocused = idx === safeFocusedIndex;
                                            const auditPass = isQualityAuditPass(item.qualityAudit);
                                            const auditScore = item.qualityAudit ? Number(item.qualityAudit.score ?? 0) : null;
                                            return (
                                                <tr
                                                    key={item.questionId}
                                                    data-focused-row={isFocused ? 'true' : undefined}
                                                    onClick={() => setFocusedQueueIndex(idx)}
                                                    style={{
                                                        borderTop: '1px solid rgba(255,255,255,0.08)',
                                                        background: isFocused ? 'rgba(134, 218, 255, 0.08)' : 'transparent',
                                                        borderLeft: isFocused ? '3px solid #86daff' : '3px solid transparent',
                                                    }}
                                                >
                                                    <td style={{ padding: '6px 8px', verticalAlign: 'top', width: 56 }}>
                                                        <button
                                                            type="button"
                                                            role="checkbox"
                                                            aria-checked={selectedSet.has(item.questionId)}
                                                            aria-label={`Select Question ${item.questionId.slice(0, 8)}`}
                                                            className="sd-button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleSelectId(item.questionId);
                                                            }}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                minWidth: 44,
                                                                minHeight: 44,
                                                                width: 44,
                                                                height: 44,
                                                                padding: 0,
                                                                borderRadius: 8,
                                                                background: selectedSet.has(item.questionId) ? 'rgba(25, 129, 236, 0.36)' : 'rgba(10, 24, 41, 0.9)',
                                                                border: selectedSet.has(item.questionId) ? '1px solid #86daff' : '1px solid rgba(189, 208, 226, 0.35)',
                                                                color: '#f2f7ff',
                                                                fontSize: 16,
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            <span
                                                                aria-hidden="true"
                                                                style={{
                                                                    display: 'inline-block',
                                                                    width: 16,
                                                                    height: 16,
                                                                    borderRadius: 4,
                                                                    border: selectedSet.has(item.questionId)
                                                                        ? '2px solid #86daff'
                                                                        : '2px solid rgba(189, 208, 226, 0.55)',
                                                                    background: selectedSet.has(item.questionId)
                                                                        ? '#1981ec'
                                                                        : 'transparent',
                                                                    boxShadow: selectedSet.has(item.questionId)
                                                                        ? 'inset 0 0 0 2px #0a1829'
                                                                        : 'none',
                                                                }}
                                                            />
                                                        </button>
                                                    </td>
                                                    <td style={{ padding: '10px 10px', fontSize: 12, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                                        <div>{PRETTY[item.category] || item.category}</div>
                                                        {item.isThinCategory && (
                                                            <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 6px', borderRadius: 999, background: 'rgba(134, 218, 255, 0.16)', color: '#86daff', fontSize: 12, fontWeight: 600 }}>
                                                                Thin Priority
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 10px', fontSize: 12, verticalAlign: 'top', textTransform: 'capitalize' }}>
                                                        {item.difficulty}
                                                    </td>
                                                    <td style={{ padding: '10px 10px', fontSize: 12, verticalAlign: 'top' }}>
                                                        {item.qualityScore ?? 'Unset'}
                                                    </td>
                                                    <td style={{ padding: '10px 10px', fontSize: 12, verticalAlign: 'top', minWidth: 180 }}>
                                                        {auditPass ? (
                                                            <div>
                                                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: 'rgba(74, 222, 128,0.18)', border: '1px solid rgba(74, 222, 128,0.45)', color: '#bbf7d0', fontSize: 12, fontWeight: 700 }}>
                                                                    Audit {auditScore}/100
                                                                </span>
                                                                <div style={{ fontSize: 12, color: '#bdd0e2', marginTop: 4 }}>
                                                                    Ready For Review
                                                                </div>
                                                            </div>
                                                        ) : item.qualityAudit ? (
                                                            <div>
                                                                <span style={{ display: 'inline-block', marginBottom: 4, padding: '2px 8px', borderRadius: 999, background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.45)', color: '#fecaca', fontSize: 12, fontWeight: 700 }}>
                                                                    Audit {auditScore}/100
                                                                </span>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                                    {(item.qualityAudit.issues || []).map((issue) => (
                                                                        <span key={issue} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.38)', color: '#fecaca', fontSize: 12, fontWeight: 600 }}>
                                                                            {formatQualityIssueLabel(issue)}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: 12, color: '#bdd0e2' }}>Pending Check</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 10px', fontSize: 13, lineHeight: 1.45 }}>
                                                        <div>{item.question}</div>
                                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                                                            ID {item.questionId.slice(0, 8)} · Source {item.source}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}

                {/* Empirical Difficulty Calibration Tab */}
                {activeTab === 'calibration' && (
                    <section className={consoleStyles.panel} style={{ padding: 20 }} aria-label="Empirical Difficulty Calibration">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Empirical Difficulty Calibration</h2>
                            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
                                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <span>Min Shown</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={1000}
                                        value={minShown}
                                        onChange={(e) => setMinShown(Math.max(1, Number.parseInt(e.target.value || '15', 10) || 15))}
                                        style={{ width: 72, padding: '6px 8px', borderRadius: 6, fontSize: 12, background: '#0b1020', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }}
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => loadWorkbench({ mode: queueMode, category: queueCategory, min: minShown })}
                                    disabled={workbenchLoading}
                                    style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(56,189,248,0.22)', color: '#e0f2fe', border: '1px solid #38bdf8' }}
                                >
                                    {workbenchLoading ? 'Analyzing' : 'Run Calibration Report'}
                                </button>
                            </div>
                        </div>

                        <div className={consoleStyles.responsiveGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
                            <Card title="Flagged Outliers" value={String(calibrationSummary.flagged_count || 0)} subtitle={`Min shown >= ${minShown}`} color="#86daff" />
                            <Card title="Easy Too Hard" value={String(calibrationSummary.easy_too_hard_count || 0)} subtitle="Solve rate < 35%" color="#ef4444" />
                            <Card title="Hard Too Easy" value={String(calibrationSummary.hard_too_easy_count || 0)} subtitle="Solve rate > 85%" color="#4ade80" />
                            <Card title="Skip Or Report Outliers" value={String((calibrationSummary.high_skip_count || 0) + (calibrationSummary.high_report_count || 0))} subtitle="High skip or open reports" color="#bdd0e2" />
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.78)', marginBottom: 6 }}>
                                Re-Tier Audit Reason
                            </label>
                            <input
                                type="text"
                                aria-label="Calibration Re-Tier Reason"
                                value={calibrationReason}
                                onChange={(e) => setCalibrationReason(e.target.value)}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: '#0b1020', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }}
                            />
                        </div>

                        {calibrationOutliers.length === 0 ? (
                            <div role="status" style={{ padding: 20, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                                No Empirical Difficulty Outliers Exceed The Current Threshold (Min Shown {minShown}).
                            </div>
                        ) : (
                            <div className={consoleStyles.tableWell} tabIndex={0} role="region" aria-label="Empirical Difficulty Outliers">
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                            <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>QUESTION</th>
                                            <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>TIER</th>
                                            <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>SOLVE RATE</th>
                                            <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>FLAGS</th>
                                            <th style={{ padding: '10px 10px', textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>ONE-CLICK RE-TIER</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {calibrationOutliers.map((row) => (
                                            <tr key={row.question_id} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                                <td style={{ padding: '10px 10px', fontSize: 13, lineHeight: 1.45 }}>
                                                    <div>{row.question_preview}</div>
                                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                                                        {PRETTY[row.category] || row.category} · ID {row.question_id.slice(0, 8)} · Shown {row.shown_count}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 10px', fontSize: 12, textTransform: 'capitalize' }}>
                                                    <div>Current: {row.difficulty}</div>
                                                    {row.suggested_difficulty && (
                                                        <div style={{ color: '#86daff' }}>Suggested: {row.suggested_difficulty}</div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '10px 10px', fontSize: 12 }}>
                                                    <div>{row.solve_rate !== null ? `${Math.round(Number(row.solve_rate) * 100)}%` : 'N/A'}</div>
                                                    <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                                                        Skip {row.skip_rate !== null ? `${Math.round(Number(row.skip_rate) * 100)}%` : '0%'} · Reports {row.open_reports}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 10px', fontSize: 12 }}>
                                                    {(row.flags || []).map((flag) => (
                                                        <span key={flag} style={{ display: 'inline-block', marginRight: 6, marginBottom: 4, padding: '2px 8px', borderRadius: 999, background: 'rgba(134, 218, 255, 0.16)', color: '#86daff', fontSize: 12 }}>
                                                            {formatFlagLabel(flag)}
                                                        </span>
                                                    ))}
                                                </td>
                                                <td style={{ padding: '10px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'inline-flex', gap: 6 }}>
                                                        <button
                                                            type="button"
                                                            disabled={actionBusy}
                                                            onClick={() => runBatchCurate({ questionIds: [row.question_id], action: 'set_difficulty_easy', reason: calibrationReason })}
                                                            style={{ minHeight: 44, padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(134, 218, 255, 0.16)', color: '#f2f7ff', border: '1px solid rgba(134, 218, 255, 0.45)' }}
                                                        >
                                                            Easy
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={actionBusy}
                                                            onClick={() => runBatchCurate({ questionIds: [row.question_id], action: 'set_difficulty_medium', reason: calibrationReason })}
                                                            style={{ minHeight: 44, padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(12, 85, 192, 0.34)', color: '#f2f7ff', border: '1px solid rgba(134, 218, 255, 0.45)' }}
                                                        >
                                                            Medium
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={actionBusy}
                                                            onClick={() => runBatchCurate({ questionIds: [row.question_id], action: 'set_difficulty_hard', reason: calibrationReason })}
                                                            style={{ minHeight: 44, padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(74, 222, 128, 0.18)', color: '#f2f7ff', border: '1px solid rgba(74, 222, 128, 0.45)' }}
                                                        >
                                                            Hard
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={actionBusy}
                                                            onClick={() => runBatchCurate({ questionIds: [row.question_id], action: 'quarantine', reason: calibrationReason })}
                                                            style={{ minHeight: 44, padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#991b1b', color: '#f2f7ff', border: '1px solid #ef4444' }}
                                                        >
                                                            Quarantine
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </main>
    );
}

function Card({ title, value, subtitle, color }) {
    return (
        <div className={`sd-metric ${consoleStyles.metric}`} style={{ padding: 20, borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: 12, color: '#bdd0e2', letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
            <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginBottom: 4, color: '#f2f7ff' }}>{value}</div>
            <div style={{ fontSize: 12, color: '#bdd0e2' }}>{subtitle}</div>
        </div>
    );
}
