/**
 * /admin/signup-health — Live signup status dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 * Server-rendered page for operators. Reads:
 *   - public.signup_health_view (real signups, probe runs, errors)
 *   - public.probe_heartbeats (last 20 probe runs across all probes)
 *   - public.signup_errors (last 50 unforwarded + recent forwarded)
 *
 * Auth: requires ADMIN_ROUTE_SECRET via x-admin-secret OR a Bearer token
 * for an authenticated user with profiles.is_admin = true. Defense in
 * depth — middleware also gates /api/admin paths.
 *
 * Why this exists: when an alert fires at 3am, the on-call should be
 * able to load this page in their browser and see WHAT IS HAPPENING
 * instead of having to ssh into Supabase and write SQL. Replaces the
 * "I have to query the DB to see what's going on" workflow.
 *
 * No write actions — read-only. Refresh by reloading the page.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import consoleStyles from '../../src/components/admin/OperatorAdminSurface.module.css';
import GrowthScorecard from '../../src/components/admin/GrowthScorecard';
import { loadGrowthScorecard } from '../../src/lib/acquisition/growthScorecard.mjs';
import { loadRecentSignupAttribution } from '../../src/lib/acquisition/attributionSummary.mjs';
import { loadSeoFunnelRollup } from '../../src/lib/acquisition/seoFunnelRollup.mjs';
import {
    computeVariantSignificance,
    evaluateAuthProviderReadiness,
} from '../../src/lib/acquisition/abSignificance.mjs';

/**
 * [2026-07-25] REACHABILITY FIX — same as /admin/auth-health: browsers never
 * send Bearer headers on page navigations, so the old SSR gate redirect-
 * looped every human admin through /auth/login forever. The x-admin-secret
 * curl path keeps SSR data; browsers get a client-mode shell that calls
 * /api/admin/auth-health-data?view=signup with the localStorage token.
 */
export async function getServerSideProps({ req, res }) {
    const adminSecret = req.headers['x-admin-secret'];
    const envSecret = process.env.ADMIN_ROUTE_SECRET;
    const hasAdminSecret = envSecret && adminSecret === envSecret;
    const googleOneTapConfigured = Boolean(
        typeof process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID === 'string' &&
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID.trim().length > 0
    );

    if (!hasAdminSecret) {
        return { props: { clientMode: true, googleOneTapConfigured } };
    }

    // ── Fetch the dashboard data ──
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !srKey) {
        return { props: { error: 'Server misconfigured', googleOneTapConfigured } };
    }
    const adm = createClient(url, srKey, { auth: { persistSession: false } });

    const [healthRes, heartbeatsRes, errorsRes, growth, attribution, seoFunnel] = await Promise.all([
        adm.from('signup_health_view').select('*').maybeSingle(),
        adm.from('probe_heartbeats').select('id, probe_name, status, duration_ms, occurred_at').order('occurred_at', { ascending: false }).limit(20),
        adm.from('signup_errors').select('id, email, trigger_name, error_code, error_msg, occurred_at').order('occurred_at', { ascending: false }).limit(50),
        loadGrowthScorecard(adm),
        loadRecentSignupAttribution(adm),
        (typeof loadSeoFunnelRollup === 'function'
            ? Promise.resolve().then(() => loadSeoFunnelRollup({ windowDays: 7, timeoutMs: 6500 }))
            : Promise.resolve({ available: false, reason: 'unconfigured', window_days: 7, events: {}, stages: null, rates: null }))
            .catch(() => ({ available: false, reason: 'fetch_error', window_days: 7, events: {}, stages: null, rates: null })),
    ]);

    return {
        props: {
            health: healthRes.data || null,
            heartbeats: heartbeatsRes.data || [],
            errors: errorsRes.data || [],
            error: healthRes.error?.message || null,
            generatedAt: new Date().toISOString(),
            growth,
            attribution,
            seoFunnel,
            googleOneTapConfigured,
        },
    };
}

function statusBadge(status) {
    const colors = { ok: '#166534', warn: '#713f12', degraded: '#991b1b', failed: '#991b1b', partial: '#78350f', skipped: '#475569' };
    return (
        <span style={{
            background: colors[status] || '#6b7280',
            color: '#fff',
            padding: '2px 10px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        }}>
            {status}
        </span>
    );
}

function fmtAge(iso) {
    if (!iso) return '-';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return '0s';
    if (ms < 60_000) return Math.round(ms / 1000) + 's ago';
    if (ms < 3600_000) return Math.round(ms / 60_000) + 'm ago';
    if (ms < 86400_000) return Math.round(ms / 3600_000) + 'h ago';
    return Math.round(ms / 86400_000) + 'd ago';
}

function readLocalAccessToken() {
    try {
        return JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token || null;
    } catch (_e) {
        return null;
    }
}

export default function SignupHealthDashboard(props) {
    const [state, setState] = useState({
        loading: !!props.clientMode,
        health: props.health || null,
        heartbeats: props.heartbeats || [],
        errors: props.errors || [],
        error: props.error || null,
        generatedAt: props.generatedAt || null,
        growth: props.growth || null,
        attribution: props.attribution || props.data?.attribution || null,
        seoFunnel: props.seoFunnel || props.data?.seoFunnel || null,
    });

    useEffect(() => {
        if (!props.clientMode) return;
        let cancelled = false;
        (async () => {
            const token = readLocalAccessToken();
            if (!token) {
                window.location.replace('/auth/login?redirect=' + encodeURIComponent('/admin/signup-health'));
                return;
            }
            try {
                const [res, healthProbe] = await Promise.all([
                    fetch('/api/admin/auth-health-data?view=signup', {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    fetch('/api/health/signup')
                        .then((probeRes) => probeRes.json().catch(() => null))
                        .catch(() => null),
                ]);
                if (res.status === 401) {
                    window.location.replace('/auth/login?redirect=' + encodeURIComponent('/admin/signup-health'));
                    return;
                }
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    if (!cancelled) setState((s) => ({ ...s, loading: false, error: json.error || `HTTP ${res.status}` }));
                    return;
                }
                if (!cancelled) {
                    setState({
                        loading: false,
                        health: json.health,
                        heartbeats: json.heartbeats || [],
                        errors: json.errors || [],
                        error: json.error || null,
                        generatedAt: json.generatedAt,
                        growth: json.growth,
                        attribution: json.attribution || healthProbe?.attribution || null,
                        seoFunnel: json.seoFunnel || healthProbe?.seoFunnel || null,
                    });
                }
            } catch (e) {
                if (!cancelled) setState((s) => ({ ...s, loading: false, error: e?.message || 'Failed to load health data' }));
            }
        })();
        return () => { cancelled = true; };
    }, [props.clientMode]);

    const { loading, health, heartbeats, errors, error, generatedAt } = state;
    if (loading) {
        return (
            <main className={consoleStyles.surface} style={S.page}>
                <h1 style={S.h1}>Signup Health</h1>
                <div className={consoleStyles.state} style={S.errBox} role="status">Loading...</div>
            </main>
        );
    }
    if (error) {
        return (
            <main className={consoleStyles.surface} style={S.page}>
                <h1 style={S.h1}>Signup Health</h1>
                <div className={consoleStyles.state} style={S.errBox} role="alert">{error}</div>
            </main>
        );
    }

    const dashboardStatus = (() => {
        if (!health) return 'degraded';
        if (Number(health.errors_1h) > 0) return 'degraded';
        if (Number(health.new_users_24h) === 0) return 'degraded';
        if (Number(health.new_users_1h) === 0) return 'warn';
        if (Number(health.probe_runs_15m) === 0) return 'warn';
        return 'ok';
    })();

    return (
        <main className={consoleStyles.surface} style={S.page}>
            <header style={S.header}>
                <div>
                    <h1 style={S.h1}>Signup Health</h1>
                    <p style={S.p}>
                        Generated {fmtAge(generatedAt)}. Reload To Refresh.
                        {' '}<a href="/admin/signup-health" style={S.link}>Refresh</a>
                    </p>
                </div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{statusBadge(dashboardStatus)}</div>
            </header>

            <GrowthScorecard report={state.growth} />

            <AttributionScorecard
                attribution={state.attribution}
                seoFunnel={state.seoFunnel}
                googleOneTapConfigured={props.googleOneTapConfigured}
            />

            <LiveOrganicFunnelScorecard seoFunnel={state.seoFunnel} />

            {health && (
                <section className={consoleStyles.panel} style={S.section}>
                    <h2 style={S.h2}>Counts</h2>
                    <div style={S.grid}>
                        <Stat label="Real signups (15m)" value={health.new_users_15m} hint="excludes probes" />
                        <Stat label="Real signups (1h)" value={health.new_users_1h} />
                        <Stat label="Real signups (24h)" value={health.new_users_24h} alert={Number(health.new_users_24h) === 0} />
                        <Stat label="Probe runs (15m)" value={health.probe_runs_15m} alert={Number(health.probe_runs_15m) === 0} hint="should be ≥ 1 if cron is wired" />
                        <Stat label="Trigger errors (1h)" value={health.errors_1h} alert={Number(health.errors_1h) > 0} />
                        <Stat label="Trigger errors (24h)" value={health.errors_24h} />
                    </div>
                    <p style={{ ...S.p, marginTop: 16 }}>
                        Last Real Signup: <strong>{fmtAge(health.last_signup_at)}</strong>
                        {' · '}
                        Last Probe: <strong>{fmtAge(health.last_probe_at)}</strong>
                        {' · '}
                        Last Error: <strong>{fmtAge(health.last_error_at)}</strong>
                    </p>
                </section>
            )}

            <section className={consoleStyles.panel} style={S.section}>
                <h2 style={S.h2}>Recent Probe Heartbeats (Last 20)</h2>
                {heartbeats.length === 0 ? (
                    <p style={S.p}>No Heartbeats Recorded Yet. Wait For The Cron To Fire (5-15 Min After First Deploy).</p>
                ) : (
                    <div className={consoleStyles.tableWell} tabIndex={0} role="region" aria-label="Recent Probe Heartbeats">
                    <table style={S.table}>
                        <thead>
                            <tr>
                                <th style={S.th}>When</th>
                                <th style={S.th}>Probe</th>
                                <th style={S.th}>Status</th>
                                <th style={S.th}>Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            {heartbeats.map((h) => (
                                <tr key={h.id}>
                                    <td style={S.td}>{fmtAge(h.occurred_at)}</td>
                                    <td style={S.td}><code>{h.probe_name}</code></td>
                                    <td style={S.td}>{statusBadge(h.status)}</td>
                                    <td style={S.td}>{h.duration_ms ? `${h.duration_ms}ms` : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}
            </section>

            <section className={consoleStyles.panel} style={S.section}>
                <h2 style={S.h2}>Recent Signup_Errors (Last 50)</h2>
                {errors.length === 0 ? (
                    <p style={{ ...S.p, color: '#65e8aa' }}>No Trigger Errors Logged. Signups Are Flowing Cleanly Through All 3 Triggers.</p>
                ) : (
                    <div className={consoleStyles.tableWell} tabIndex={0} role="region" aria-label="Recent Signup Errors">
                    <table style={S.table}>
                        <thead>
                            <tr>
                                <th style={S.th}>When</th>
                                <th style={S.th}>Trigger</th>
                                <th style={S.th}>Code</th>
                                <th style={S.th}>Message</th>
                            </tr>
                        </thead>
                        <tbody>
                            {errors.map((e) => (
                                <tr key={e.id}>
                                    <td style={S.td}>{fmtAge(e.occurred_at)}</td>
                                    <td style={S.td}><code>{e.trigger_name}</code></td>
                                    <td style={S.td}><code>{e.error_code}</code></td>
                                    <td style={{ ...S.td, fontSize: 12, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.error_msg?.slice(0, 200)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}
            </section>

            <footer style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #2a3a4a', color: '#aabcc4', fontSize: 12 }}>
                Backed By <code>Public.Signup_Health_View</code>, <code>Public.Probe_Heartbeats</code>, <code>Public.Signup_Errors</code>.
                {' '}Runbook: <a href="/docs/SIGNUP_RUNBOOK.md" style={S.link}>SIGNUP_RUNBOOK.Md</a>
            </footer>
        </main>
    );
}

function pctOf(count, total) {
    if (!total || total <= 0) return '0%';
    return `${Math.round((Number(count || 0) / total) * 100)}%`;
}

function formatLiftPct(liftPct) {
    if (typeof liftPct !== 'number' || !Number.isFinite(liftPct)) return 'N/A';
    const prefix = liftPct > 0 ? '+' : '';
    return `${prefix}${liftPct}%`;
}

function OAuthReadinessCard({ readiness }) {
    if (!readiness) return null;
    const oauthShareDisplay = typeof readiness.oauthSharePct === 'number' && Number.isFinite(readiness.oauthSharePct)
        ? `${readiness.oauthSharePct}%`
        : 'N/A';
    const oneTapLabel = readiness.googleOneTapConfigured ? 'Configured' : 'Pending Env Var';
    const magicLinkLabel = readiness.magicLinkReady ? 'Active' : 'Unavailable';

    return (
        <div
            data-testid="oauth-readiness-card"
            data-google-one-tap={readiness.googleOneTapConfigured ? 'configured' : 'pending'}
            style={S.readinessCard}
        >
            <div style={S.readinessHeader}>
                <div style={S.readinessTitle}>OAuth &amp; One Tap Readiness</div>
                <span
                    style={{
                        ...S.attrBadge,
                        borderColor: readiness.googleOneTapConfigured ? '#65e8aa' : '#38bdf8',
                        color: readiness.googleOneTapConfigured ? '#65e8aa' : '#86daff',
                    }}
                >
                    {oneTapLabel}
                </span>
            </div>
            <div style={S.readinessGrid}>
                <div className={consoleStyles.metric} style={{ ...S.attrCard, borderLeft: '3px solid #38bdf8' }}>
                    <div style={S.attrLabel}>Live OAuth Share</div>
                    <div style={S.attrValue}>{oauthShareDisplay}</div>
                    <div style={S.attrMeta}>
                        {readiness.oauthCount} OAuth / {readiness.emailCount} Email
                    </div>
                </div>
                <div
                    className={consoleStyles.metric}
                    style={{
                        ...S.attrCard,
                        borderLeft: `3px solid ${readiness.googleOneTapConfigured ? '#65e8aa' : '#86daff'}`,
                    }}
                >
                    <div style={S.attrLabel}>Google One Tap</div>
                    <div style={S.readinessStatusValue}>{oneTapLabel}</div>
                    <div style={S.attrMeta}>NEXT_PUBLIC_GOOGLE_CLIENT_ID</div>
                </div>
                <div className={consoleStyles.metric} style={{ ...S.attrCard, borderLeft: '3px solid #65e8aa' }}>
                    <div style={S.attrLabel}>Magic Link Readiness</div>
                    <div style={S.readinessStatusValue}>{magicLinkLabel}</div>
                    <div style={S.attrMeta}>Passwordless Email OTP</div>
                </div>
            </div>
            <p style={S.readinessNote}>{readiness.recommendation}</p>
        </div>
    );
}

function AttributionScorecard({ attribution, seoFunnel, googleOneTapConfigured }) {
    const channels = attribution?.channels || null;
    const providers = attribution?.providers || null;
    const aiEngines = attribution?.aiEngines && typeof attribution.aiEngines === 'object' ? attribution.aiEngines : {};
    const experimentVariants = attribution?.experimentVariants && typeof attribution.experimentVariants === 'object'
        ? attribution.experimentVariants
        : {};
    const totalSignups = Number(attribution?.totalSignups || 0);
    const last24h = attribution?.last_24h || null;
    const last24hChannels = last24h?.channels || {};
    const last24hAiEngines = last24h?.aiEngines && typeof last24h.aiEngines === 'object' ? last24h.aiEngines : {};
    const last24hVariants = last24h?.experimentVariants && typeof last24h.experimentVariants === 'object'
        ? last24h.experimentVariants
        : {};
    const landingPages = Array.isArray(attribution?.landingPages) ? attribution.landingPages : [];
    const unlockKeys = Array.isArray(attribution?.unlockKeys) ? attribution.unlockKeys : [];
    const isAvailable = Boolean(attribution && attribution.available !== false && channels);

    const channelCards = [
        { key: 'organic_google', label: 'Google Organic', accent: '#38bdf8' },
        { key: 'organic_bing', label: 'Bing Organic', accent: '#86daff' },
        { key: 'organic_ai', label: 'AI Search (ChatGPT/Perplexity/Claude/Gemini)', accent: '#65e8aa' },
        { key: 'referral', label: 'Referral', accent: '#00D4FF' },
        { key: 'paid_or_utm', label: 'UTM / Campaign', accent: '#bdd0e2' },
        { key: 'direct', label: 'Direct', accent: '#aabcc4' },
    ];

    const providerCards = [
        { key: 'google', label: 'Google OAuth', value: Number(providers?.google || 0) },
        { key: 'facebook', label: 'Facebook OAuth', value: Number(providers?.facebook || 0) },
        { key: 'oauth_total', label: 'Total OAuth', value: Number(providers?.oauth_total || 0) },
        { key: 'email', label: 'Email', value: Number(providers?.email || 0) },
    ];

    const extraVariantKeys = Object.keys(experimentVariants)
        .filter((k) => k !== 'control-gto' && k !== 'welcome-vip-500' && Number(experimentVariants[k] || 0) > 0)
        .sort();
    const experimentCards = [
        { key: 'control-gto', label: 'Control GTO (control-gto)', accent: '#38bdf8' },
        { key: 'welcome-vip-500', label: 'Welcome VIP + 500 (welcome-vip-500)', accent: '#65e8aa' },
        ...extraVariantKeys.map((key) => ({ key, label: `Variant (${key})`, accent: '#00D4FF' })),
    ];
    const totalExperimentSignups = experimentCards.reduce(
        (sum, item) => sum + Number(experimentVariants[item.key] || 0),
        0,
    );

    const controlSignups = Number(experimentVariants['control-gto'] || 0);
    const variantSignups = Number(experimentVariants['welcome-vip-500'] || 0);
    const explicitExposures = attribution?.experimentExposures && typeof attribution.experimentExposures === 'object'
        ? attribution.experimentExposures
        : null;
    const sheetOpened = seoFunnel?.available === true ? Number(seoFunnel?.stages?.sheetOpened || 0) : 0;
    const { controlTotal, variantTotal } = (() => {
        if (
            explicitExposures &&
            Number(explicitExposures['control-gto']) > 0 &&
            Number(explicitExposures['welcome-vip-500']) > 0
        ) {
            return {
                controlTotal: Number(explicitExposures['control-gto']),
                variantTotal: Number(explicitExposures['welcome-vip-500']),
            };
        }
        if (sheetOpened >= controlSignups + variantSignups && sheetOpened > 0) {
            const halfSheet = Math.floor(sheetOpened / 2);
            return {
                controlTotal: Math.max(halfSheet, controlSignups),
                variantTotal: Math.max(sheetOpened - halfSheet, variantSignups),
            };
        }
        const cohortTotal = controlSignups + variantSignups;
        return { controlTotal: cohortTotal, variantTotal: cohortTotal };
    })();

    const abStats = typeof computeVariantSignificance === 'function'
        ? computeVariantSignificance({
            controlCount: controlSignups,
            controlTotal,
            variantCount: variantSignups,
            variantTotal,
        })
        : {
            controlTotal,
            variantTotal,
            minSamplePerVariant: 30,
            liftPct: null,
            sampleReady: false,
            significant: false,
            winner: 'insufficient_sample',
            confidenceLabel: 'Collecting Sample',
        };

    const readinessEnv = typeof googleOneTapConfigured === 'boolean'
        ? (googleOneTapConfigured ? { NEXT_PUBLIC_GOOGLE_CLIENT_ID: '1' } : {})
        : {
            NEXT_PUBLIC_GOOGLE_CLIENT_ID:
                (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_GOOGLE_CLIENT_ID) || '',
        };
    const authReadiness = typeof evaluateAuthProviderReadiness === 'function'
        ? evaluateAuthProviderReadiness({
            attribution: isAvailable ? attribution : null,
            env: readinessEnv,
        })
        : null;

    const aiEngineLabels = {
        chatgpt: 'ChatGPT',
        perplexity: 'Perplexity',
        claude: 'Claude',
        gemini: 'Gemini',
        copilot: 'Copilot',
        grok: 'Grok',
        meta_ai: 'Meta AI',
        deepseek: 'DeepSeek',
        mistral: 'Mistral',
        other_ai: 'Other AI',
    };
    const coreAiKeys = ['chatgpt', 'perplexity', 'claude', 'gemini'];
    const extraAiKeys = Object.keys(aiEngines)
        .filter((k) => !coreAiKeys.includes(k) && Number(aiEngines[k] || 0) > 0)
        .sort();
    const aiEngineCards = [...coreAiKeys, ...extraAiKeys].map((key) => ({
        key,
        label: aiEngineLabels[key] || key,
        count: Number(aiEngines[key] || 0),
        count24h: Number(last24hAiEngines[key] || 0),
    }));
    const totalAiEngineSignups = Number(channels?.organic_ai || 0) || aiEngineCards.reduce((s, item) => s + item.count, 0);

    return (
        <section
            id="organic-attribution-scorecard"
            aria-labelledby="organic-attribution-title"
            className={consoleStyles.panel}
            style={{ ...S.section, borderRadius: 0, border: '1px solid #2b4663', background: '#0a1a2b' }}
        >
            <div style={S.attrHeader}>
                <div>
                    <h2 id="organic-attribution-title" style={{ ...S.h2, marginBottom: 6, color: '#f2f7ff' }}>
                        Organic SEO &amp; Conversion Funnel Attribution
                    </h2>
                    <p style={{ ...S.p, color: '#bdd0e2' }}>
                        Rolling 7-Day Aggregate Attribution With Zero PII. Total Signups: {totalSignups}
                        {last24h ? ` | Last 24h: ${Number(last24h.totalSignups || 0)}` : ''}
                    </p>
                </div>
                <span style={S.attrBadge}>
                    {isAvailable ? 'Live Attribution Feed' : 'Attribution Unavailable'}
                </span>
            </div>

            {!isAvailable ? (
                <>
                    <p style={{ ...S.p, color: '#bdd0e2', marginTop: 12 }} role="status">
                        Organic Attribution Data Is Unavailable. Reload To Retry.
                    </p>
                    <OAuthReadinessCard readiness={authReadiness} />
                </>
            ) : (
                <>
                    <h3 style={S.attrSubhead}>Acquisition Channels</h3>
                    <div style={S.attrChannelGrid}>
                        {channelCards.map((item) => {
                            const count = Number(channels[item.key] || 0);
                            const count24h = Number(last24hChannels[item.key] || 0);
                            return (
                                <div
                                    key={item.key}
                                    className={consoleStyles.metric}
                                    style={{
                                        ...S.attrCard,
                                        borderLeft: `3px solid ${item.accent}`,
                                    }}
                                >
                                    <div style={S.attrLabel}>{item.label}</div>
                                    <div style={S.attrValue}>{count}</div>
                                    <div style={S.attrMeta}>
                                        {pctOf(count, totalSignups)} Share | 24h: {count24h}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <h3 style={S.attrSubhead}>OAuth Vs Email Split</h3>
                    <div style={S.attrProviderGrid}>
                        {providerCards.map((item) => (
                            <div
                                key={item.key}
                                className={consoleStyles.metric}
                                style={S.attrCard}
                            >
                                <div style={S.attrLabel}>{item.label}</div>
                                <div style={S.attrValue}>{item.value}</div>
                                <div style={S.attrMeta}>{pctOf(item.value, totalSignups)} Share</div>
                            </div>
                        ))}
                    </div>

                    <OAuthReadinessCard readiness={authReadiness} />

                    <div style={S.sectionSubheaderRow}>
                        <h3 style={{ ...S.attrSubhead, margin: 0 }}>A/B Offer Experiment Breakdown (Control-GTO Vs Welcome-VIP-500)</h3>
                        <span
                            data-testid="ab-significance-badge"
                            data-significant={abStats.significant ? 'true' : 'false'}
                            data-sample-ready={abStats.sampleReady ? 'true' : 'false'}
                            data-winner={abStats.winner}
                            style={{
                                ...S.attrBadge,
                                borderColor: abStats.significant ? '#65e8aa' : '#2b4663',
                                color: abStats.significant ? '#65e8aa' : '#86daff',
                            }}
                        >
                            {abStats.confidenceLabel}
                            {' | '}
                            {abStats.sampleReady
                                ? 'Sample Ready'
                                : `Sample ${Math.min(abStats.controlTotal, abStats.variantTotal)}/${abStats.minSamplePerVariant}`}
                            {' | '}
                            Lift: {formatLiftPct(abStats.liftPct)}
                        </span>
                    </div>
                    <div style={S.attrChannelGrid} data-section="experiment-variants">
                        {experimentCards.map((item) => {
                            const count = Number(experimentVariants[item.key] || 0);
                            const count24h = Number(last24hVariants[item.key] || 0);
                            return (
                                <div
                                    key={item.key}
                                    className={consoleStyles.metric}
                                    style={{
                                        ...S.attrCard,
                                        borderLeft: `3px solid ${item.accent}`,
                                    }}
                                >
                                    <div style={S.attrLabel}>{item.label}</div>
                                    <div style={S.attrValue}>{count}</div>
                                    <div style={S.attrMeta}>
                                        {pctOf(count, totalExperimentSignups || totalSignups)} Split | 24h: {count24h}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <h3 style={S.attrSubhead}>AI Search Engines</h3>
                    <div style={S.attrProviderGrid} data-section="ai-search-engines">
                        {aiEngineCards.map((item) => (
                            <div
                                key={item.key}
                                className={consoleStyles.metric}
                                style={{
                                    ...S.attrCard,
                                    borderLeft: '3px solid #65e8aa',
                                }}
                            >
                                <div style={S.attrLabel}>{item.label}</div>
                                <div style={S.attrValue}>{item.count}</div>
                                <div style={S.attrMeta}>
                                    {pctOf(item.count, totalAiEngineSignups || totalSignups)} AI Share | 24h: {item.count24h}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className={consoleStyles.responsiveGrid} style={S.attrTablesGrid}>
                        <div>
                            <h3 style={S.attrSubhead}>Top Converting Landing Pages</h3>
                            {landingPages.length === 0 ? (
                                <p style={{ ...S.p, color: '#aabcc4' }}>No Attributed Landing Pages Recorded Yet.</p>
                            ) : (
                                <div className={consoleStyles.tableWell} tabIndex={0} role="region" aria-label="Top Converting Landing Pages">
                                    <table style={S.table}>
                                        <thead>
                                            <tr>
                                                <th style={S.th}>Landing Page</th>
                                                <th style={S.th}>Signups</th>
                                                <th style={S.th}>Share</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {landingPages.map((row) => (
                                                <tr key={row.path}>
                                                    <td style={S.td}><code>{row.path}</code></td>
                                                    <td style={S.td}>{row.count}</td>
                                                    <td style={S.td}>{pctOf(row.count, totalSignups)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 style={S.attrSubhead}>Top Unlock Gates</h3>
                            {unlockKeys.length === 0 ? (
                                <p style={{ ...S.p, color: '#aabcc4' }}>No Unlock Gate Conversions Recorded Yet.</p>
                            ) : (
                                <div className={consoleStyles.tableWell} tabIndex={0} role="region" aria-label="Top Unlock Gates">
                                    <table style={S.table}>
                                        <thead>
                                            <tr>
                                                <th style={S.th}>Unlock Gate</th>
                                                <th style={S.th}>Signups</th>
                                                <th style={S.th}>Share</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {unlockKeys.map((row) => (
                                                <tr key={row.key}>
                                                    <td style={S.td}><code>{row.key}</code></td>
                                                    <td style={S.td}>{row.count}</td>
                                                    <td style={S.td}>{pctOf(row.count, totalSignups)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}

function formatFunnelRate(rate) {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return 'N/A';
    return `${rate}%`;
}

function LiveOrganicFunnelScorecard({ seoFunnel }) {
    const isAvailable = Boolean(seoFunnel && seoFunnel.available === true && seoFunnel.stages);
    const isStale = Boolean(isAvailable && seoFunnel?.stale === true);
    const windowDays = Number.isInteger(seoFunnel?.window_days) && seoFunnel.window_days > 0
        ? seoFunnel.window_days
        : 7;
    const stages = isAvailable ? seoFunnel.stages : null;
    const events = isAvailable && seoFunnel.events && typeof seoFunnel.events === 'object'
        ? seoFunnel.events
        : {};
    const rates = isAvailable && seoFunnel.rates && typeof seoFunnel.rates === 'object'
        ? seoFunnel.rates
        : {};
    const viralShares = Number(stages?.viralShares || 0);

    const tierEventCards = stages ? [
        { key: 'seo_local_action_bar_click', label: 'Local Action Clicks', stage: 'Engaged', accent: '#00D4FF' },
        { key: 'seo_calc_milestone_click', label: 'Calculator Milestone Clicks', stage: 'Engaged', accent: '#00D4FF' },
        { key: 'seo_quick_signup_magic_link_sent', label: 'Magic Link Emails Sent', stage: 'Auth Intent', accent: '#0ea5e9' },
        { key: 'seo_concept_bridge_click', label: 'Concept Bridge Clicks', stage: 'Engaged', accent: '#00D4FF' },
        { key: 'seo_calculator_share_click', label: 'Calculator Spot Shares', stage: 'Viral Shares', accent: '#65e8aa' },
        { key: 'seo_mini_gto_drill_share', label: 'GTO Drill Shares', stage: 'Viral Shares', accent: '#65e8aa' },
        { key: 'seo_member_referral_link_copied', label: 'Member Referral Copies', stage: 'Viral Shares', accent: '#65e8aa' },
        { key: 'seo_venue_follow_signup_click', label: 'Venue Follow Signups', stage: 'Engaged', accent: '#00D4FF' },
        { key: 'seo_video_bridge_click', label: 'Video Bridge Clicks', stage: 'Engaged', accent: '#00D4FF' },
    ] : [];

    const stageRows = stages ? [
        {
            key: 'engaged',
            label: 'Tool/Drill Engaged',
            count: Number(stages.engaged || 0),
            accent: '#00D4FF',
            stepRate: null,
            stepContext: 'Entry Stage',
        },
        {
            key: 'sheetOpened',
            label: 'Quick Signup Opened',
            count: Number(stages.sheetOpened || 0),
            accent: '#38bdf8',
            stepRate: rates.engagedToSheetPct,
            stepContext: 'From Tool/Drill Engaged',
        },
        {
            key: 'authIntent',
            label: 'OAuth / Email Click',
            count: Number(stages.authIntent || 0),
            accent: '#0ea5e9',
            stepRate: rates.sheetToAuthIntentPct,
            stepContext: 'From Quick Signup Opened',
        },
        {
            key: 'activated',
            label: 'Account Activated',
            count: Number(stages.activated || 0),
            accent: '#86daff',
            stepRate: rates.authIntentToActivatedPct,
            stepContext: 'From OAuth / Email Click',
        },
        {
            key: 'spotsSynced',
            label: 'Cloud Spots Synced',
            count: Number(stages.spotsSynced || 0),
            accent: '#65e8aa',
            stepRate: rates.activatedToSyncedPct,
            stepContext: 'From Account Activated',
        },
    ] : [];

    const maxStageCount = stageRows.reduce((max, row) => Math.max(max, row.count), 0);

    const unavailableDetail = (() => {
        if (seoFunnel?.reason === 'unconfigured') {
            return 'PostHog Reporting Credentials Are Not Configured For This Environment.';
        }
        if (seoFunnel?.reason === 'timeout') {
            return 'PostHog Reporting Query Timed Out. Reload To Retry.';
        }
        return 'PostHog Reporting Feed Could Not Be Reached. Reload To Retry.';
    })();

    return (
        <section
            id="live-organic-funnel-scorecard"
            aria-labelledby="live-organic-funnel-title"
            className={consoleStyles.panel}
            style={{ ...S.section, borderRadius: 0, border: '1px solid #2b4663', background: '#0a1a2b' }}
        >
            <div style={S.attrHeader}>
                <div>
                    <h2 id="live-organic-funnel-title" style={{ ...S.h2, marginBottom: 6, color: '#f2f7ff' }}>
                        Live Organic Conversion Funnel (7-Day Telemetry)
                    </h2>
                    <p style={{ ...S.p, color: '#bdd0e2' }}>
                        Rolling {windowDays}-Day PostHog Aggregate Event Telemetry With Zero PII.
                    </p>
                </div>
                <div style={S.badgeGroup}>
                    {isStale && (
                        <span data-testid="seo-funnel-stale-pill" style={S.stalePill}>
                            Cached Snapshot
                        </span>
                    )}
                    <span style={S.attrBadge}>
                        {isAvailable ? 'Live PostHog Telemetry' : 'PostHog Telemetry Unavailable'}
                    </span>
                </div>
            </div>

            {!isAvailable ? (
                <div style={S.funnelUnavailableBox} role="status" data-state="unavailable">
                    <div style={S.funnelUnavailableTitle}>PostHog Telemetry Unavailable</div>
                    <p style={{ ...S.p, color: '#bdd0e2', marginTop: 6 }}>
                        {unavailableDetail}
                    </p>
                </div>
            ) : (
                <>
                    <div style={S.funnelList} data-state="available">
                        {stageRows.map((stage, idx) => {
                            const widthPct = maxStageCount > 0 && stage.count > 0
                                ? Math.max(2, Math.min(100, Math.round((stage.count / maxStageCount) * 100)))
                                : 0;
                            return (
                                <div
                                    key={stage.key}
                                    style={S.funnelRow}
                                    data-funnel-stage={stage.key}
                                >
                                    <div style={S.funnelRowHeader}>
                                        <div style={S.funnelStageLabel}>
                                            <span style={S.funnelStepIndex}>{idx + 1}.</span> {stage.label}
                                        </div>
                                        <div style={S.funnelStageMetrics}>
                                            <span style={S.funnelStageCount}>{stage.count.toLocaleString('en-US')}</span>
                                            <span style={S.funnelStepRate}>
                                                {idx === 0
                                                    ? stage.stepContext
                                                    : `${formatFunnelRate(stage.stepRate)} Conversion (${stage.stepContext})`}
                                            </span>
                                        </div>
                                    </div>
                                    <div
                                        style={S.funnelBarTrack}
                                        role="progressbar"
                                        aria-label={stage.label}
                                        aria-valuenow={stage.count}
                                        aria-valuemin={0}
                                        aria-valuemax={maxStageCount || 100}
                                    >
                                        <div
                                            style={{
                                                ...S.funnelBarFill,
                                                width: `${widthPct}%`,
                                                background: stage.accent,
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={S.funnelRateSummaryGrid}>
                        <div className={consoleStyles.metric} style={{ ...S.attrCard, borderLeft: '3px solid #38bdf8' }}>
                            <div style={S.attrLabel}>Engaged To Sheet Opened</div>
                            <div style={S.attrValue}>{formatFunnelRate(rates.engagedToSheetPct)}</div>
                            <div style={S.attrMeta}>Stage 1 To Stage 2 Rate</div>
                        </div>
                        <div className={consoleStyles.metric} style={{ ...S.attrCard, borderLeft: '3px solid #0ea5e9' }}>
                            <div style={S.attrLabel}>Sheet Opened To Auth Click</div>
                            <div style={S.attrValue}>{formatFunnelRate(rates.sheetToAuthIntentPct)}</div>
                            <div style={S.attrMeta}>Stage 2 To Stage 3 Rate</div>
                        </div>
                        <div className={consoleStyles.metric} style={{ ...S.attrCard, borderLeft: '3px solid #86daff' }}>
                            <div style={S.attrLabel}>Auth Click To Activated</div>
                            <div style={S.attrValue}>{formatFunnelRate(rates.authIntentToActivatedPct)}</div>
                            <div style={S.attrMeta}>Stage 3 To Stage 4 Rate</div>
                        </div>
                        <div
                            className={consoleStyles.metric}
                            style={{ ...S.attrCard, borderLeft: '3px solid #65e8aa' }}
                            data-funnel-metric="viralShares"
                        >
                            <div style={S.attrLabel}>Viral Shares</div>
                            <div style={S.attrValue}>{viralShares.toLocaleString('en-US')}</div>
                            <div style={S.attrMeta}>Spot Shares And Day 0 Referrals</div>
                        </div>
                    </div>

                    <h3 style={S.attrSubhead}>Tier 4-6 Organic Event Counters</h3>
                    <div style={S.attrProviderGrid} data-section="tier46-event-counters">
                        {tierEventCards.map((item) => {
                            const count = Number(events[item.key] || 0);
                            return (
                                <div
                                    key={item.key}
                                    className={consoleStyles.metric}
                                    style={{ ...S.attrCard, borderLeft: `3px solid ${item.accent}` }}
                                    data-event-counter={item.key}
                                >
                                    <div style={S.attrLabel}>{item.label}</div>
                                    <div style={S.attrValue}>{count.toLocaleString('en-US')}</div>
                                    <div style={S.attrMeta}>Stage: {item.stage}</div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
}

function Stat({ label, value, alert, hint }) {
    return (
        <div className={consoleStyles.metric} style={{
            background: alert ? 'rgba(239,68,68,0.15)' : '#1a2433',
            border: alert ? '1px solid rgba(239,68,68,0.5)' : '1px solid #2a3a4a',
            borderRadius: 8,
            padding: 16,
        }}>
            <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: alert ? '#ef4444' : '#fff', marginTop: 4 }}>{value ?? '-'}</div>
            {hint && <div style={{ fontSize: 12, color: '#aabcc4', marginTop: 4 }}>{hint}</div>}
        </div>
    );
}

const S = {
    page: { minHeight: '100vh', padding: 32, background: '#0a1628', color: '#e5e7eb', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1200, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
    h1: { fontSize: 28, fontWeight: 600, margin: '0 0 4px' },
    h2: { fontSize: 18, fontWeight: 600, margin: '0 0 16px' },
    p: { fontSize: 13, color: '#9ca3af', margin: 0 },
    section: { marginBottom: 32, padding: 24, background: '#0d1f35', borderRadius: 12, border: '1px solid #1e293b' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #2a3a4a', color: '#9ca3af', fontWeight: 500, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    td: { padding: '8px 12px', borderBottom: '1px solid #1e293b' },
    link: { color: '#00D4FF', textDecoration: 'none' },
    errBox: { padding: 16, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 8, color: '#fca5a5' },
    attrHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
    attrBadge: { display: 'inline-block', padding: '4px 10px', borderRadius: 0, border: '1px solid #2b4663', background: '#071321', color: '#86daff', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' },
    attrSubhead: { fontSize: 14, fontWeight: 600, color: '#86daff', margin: '18px 0 10px', letterSpacing: 0.3, textTransform: 'uppercase' },
    attrChannelGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
    attrProviderGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 },
    attrTablesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 8 },
    attrCard: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: 14 },
    attrLabel: { fontSize: 12, color: '#bdd0e2', fontWeight: 600, letterSpacing: 0.3 },
    attrValue: { fontSize: 26, fontWeight: 700, color: '#f2f7ff', marginTop: 6 },
    attrMeta: { fontSize: 12, color: '#aabcc4', marginTop: 4 },
    funnelUnavailableBox: { background: '#071321', border: '1px solid #2b4663', borderLeft: '3px solid #38bdf8', borderRadius: 0, padding: 16, marginTop: 8 },
    funnelUnavailableTitle: { fontSize: 14, fontWeight: 700, color: '#f2f7ff', letterSpacing: 0.3 },
    funnelList: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 },
    funnelRow: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: 14 },
    funnelRowHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    funnelStageLabel: { fontSize: 14, fontWeight: 600, color: '#f2f7ff' },
    funnelStepIndex: { color: '#00D4FF', fontWeight: 700 },
    funnelStageMetrics: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
    funnelStageCount: { fontSize: 20, fontWeight: 700, color: '#f2f7ff' },
    funnelStepRate: { fontSize: 12, color: '#86daff', fontWeight: 600 },
    funnelBarTrack: { width: '100%', height: 10, background: '#071321', border: '1px solid #1e3a57', borderRadius: 0, overflow: 'hidden' },
    funnelBarFill: { height: '100%', borderRadius: 0, transition: 'width 200ms ease' },
    funnelRateSummaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 16 },
    sectionSubheaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, margin: '18px 0 10px' },
    badgeGroup: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    stalePill: { display: 'inline-block', padding: '4px 10px', borderRadius: 0, border: '1px solid #38bdf8', background: '#071321', color: '#38bdf8', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' },
    readinessCard: { background: '#071321', border: '1px solid #2b4663', borderRadius: 0, padding: 16, marginTop: 16 },
    readinessHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    readinessTitle: { fontSize: 14, fontWeight: 700, color: '#f2f7ff', letterSpacing: 0.3, textTransform: 'uppercase' },
    readinessGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 },
    readinessStatusValue: { fontSize: 18, fontWeight: 700, color: '#f2f7ff', marginTop: 6 },
    readinessNote: { fontSize: 12, color: '#bdd0e2', margin: '12px 0 0' },
};
