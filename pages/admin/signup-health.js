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

    if (!hasAdminSecret) {
        return { props: { clientMode: true } };
    }

    // ── Fetch the dashboard data ──
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !srKey) {
        return { props: { error: 'Server misconfigured' } };
    }
    const adm = createClient(url, srKey, { auth: { persistSession: false } });

    const [healthRes, heartbeatsRes, errorsRes] = await Promise.all([
        adm.from('signup_health_view').select('*').maybeSingle(),
        adm.from('probe_heartbeats').select('id, probe_name, status, duration_ms, occurred_at').order('occurred_at', { ascending: false }).limit(20),
        adm.from('signup_errors').select('id, email, trigger_name, error_code, error_msg, occurred_at, forwarded_to_sentry').order('occurred_at', { ascending: false }).limit(50),
    ]);

    return {
        props: {
            health: healthRes.data || null,
            heartbeats: heartbeatsRes.data || [],
            errors: errorsRes.data || [],
            error: healthRes.error?.message || null,
            generatedAt: new Date().toISOString(),
        },
    };
}

function statusBadge(status) {
    const colors = { ok: '#22c55e', warn: '#eab308', degraded: '#ef4444', failed: '#ef4444', partial: '#f59e0b' };
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
    if (!iso) return '—';
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
                const res = await fetch('/api/admin/auth-health-data?view=signup', {
                    headers: { Authorization: `Bearer ${token}` },
                });
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
            <main style={S.page}>
                <h1 style={S.h1}>Signup Health</h1>
                <div style={S.errBox}>Loading…</div>
            </main>
        );
    }
    if (error) {
        return (
            <main style={S.page}>
                <h1 style={S.h1}>Signup Health</h1>
                <div style={S.errBox}>{error}</div>
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
        <main style={S.page}>
            <header style={S.header}>
                <div>
                    <h1 style={S.h1}>Signup Health</h1>
                    <p style={S.p}>
                        Generated {fmtAge(generatedAt)}. Reload to refresh.
                        {' '}<a href="/admin/signup-health" style={S.link}>↻</a>
                    </p>
                </div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{statusBadge(dashboardStatus)}</div>
            </header>

            {health && (
                <section style={S.section}>
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
                        Last real signup: <strong>{fmtAge(health.last_signup_at)}</strong>
                        {' · '}
                        Last probe: <strong>{fmtAge(health.last_probe_at)}</strong>
                        {' · '}
                        Last error: <strong>{fmtAge(health.last_error_at)}</strong>
                    </p>
                </section>
            )}

            <section style={S.section}>
                <h2 style={S.h2}>Recent probe heartbeats (last 20)</h2>
                {heartbeats.length === 0 ? (
                    <p style={S.p}>No heartbeats recorded yet. Wait for the cron to fire (5–15 min after first deploy).</p>
                ) : (
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
                                    <td style={S.td}>{h.duration_ms ? `${h.duration_ms}ms` : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <section style={S.section}>
                <h2 style={S.h2}>Recent signup_errors (last 50)</h2>
                {errors.length === 0 ? (
                    <p style={{ ...S.p, color: '#22c55e' }}>✓ No trigger errors logged. Signups are flowing cleanly through all 3 triggers.</p>
                ) : (
                    <table style={S.table}>
                        <thead>
                            <tr>
                                <th style={S.th}>When</th>
                                <th style={S.th}>Trigger</th>
                                <th style={S.th}>Code</th>
                                <th style={S.th}>Message</th>
                                <th style={S.th}>To Sentry</th>
                            </tr>
                        </thead>
                        <tbody>
                            {errors.map((e) => (
                                <tr key={e.id}>
                                    <td style={S.td}>{fmtAge(e.occurred_at)}</td>
                                    <td style={S.td}><code>{e.trigger_name}</code></td>
                                    <td style={S.td}><code>{e.error_code}</code></td>
                                    <td style={{ ...S.td, fontSize: 12, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.error_msg?.slice(0, 200)}</td>
                                    <td style={S.td}>{e.forwarded_to_sentry ? '✓' : '⏳'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <footer style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #2a3a4a', color: '#6b7280', fontSize: 12 }}>
                Backed by <code>public.signup_health_view</code>, <code>public.probe_heartbeats</code>, <code>public.signup_errors</code>.
                {' '}Runbook: <a href="/docs/SIGNUP_RUNBOOK.md" style={S.link}>SIGNUP_RUNBOOK.md</a>
            </footer>
        </main>
    );
}

function Stat({ label, value, alert, hint }) {
    return (
        <div style={{
            background: alert ? 'rgba(239,68,68,0.15)' : '#1a2433',
            border: alert ? '1px solid rgba(239,68,68,0.5)' : '1px solid #2a3a4a',
            borderRadius: 8,
            padding: 16,
        }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: alert ? '#ef4444' : '#fff', marginTop: 4 }}>{value ?? '—'}</div>
            {hint && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{hint}</div>}
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
    th: { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #2a3a4a', color: '#9ca3af', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    td: { padding: '8px 12px', borderBottom: '1px solid #1e293b' },
    link: { color: '#00D4FF', textDecoration: 'none' },
    errBox: { padding: 16, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 8, color: '#fca5a5' },
};
