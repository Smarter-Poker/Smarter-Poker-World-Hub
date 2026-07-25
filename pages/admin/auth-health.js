/**
 * /admin/auth-health — Unified Auth Health Dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 * Extends /admin/signup-health to cover ALL auth flows:
 *   - Signup probe (every 5 min)
 *   - Login probe (every 5 min)
 *   - Recovery probe (every 15 min — password reset + magic link)
 *   - DB integrity audit (nightly)
 *   - Email deliverability (nightly)
 *
 * Backed by public.auth_health_view. Same admin gate as signup-health.
 *
 * If you only have 5 seconds to look, the per-flow status badges at the
 * top tell you everything.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

/**
 * [2026-07-25] REACHABILITY FIX. The old getServerSideProps demanded an
 * `Authorization: Bearer` header — which browsers never attach to page
 * navigations — so every human admin was redirect-looped through
 * /auth/login forever and this dashboard was unreachable except via curl.
 * (That's a big part of how outages stayed invisible: the red badges
 * rendered to no one.)
 *
 * Now: the x-admin-secret curl path still gets full SSR data. Browsers get
 * a client-mode shell that fetches /api/admin/auth-health-data with the
 * Bearer token from localStorage.
 */
export async function getServerSideProps({ req }) {
    const adminSecret = req.headers['x-admin-secret'];
    const envSecret = process.env.ADMIN_ROUTE_SECRET;
    const hasAdminSecret = envSecret && adminSecret === envSecret;

    if (!hasAdminSecret) {
        // Browser path — render the client-mode shell; auth happens against
        // /api/admin/auth-health-data with the localStorage token.
        return { props: { clientMode: true } };
    }

    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const srKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !srKey) return { props: { error: 'Server misconfigured' } };
    const adm = createClient(url, srKey, { auth: { persistSession: false } });

    const [healthRes, heartbeatsRes] = await Promise.all([
        adm.from('auth_health_view').select('*').maybeSingle(),
        adm.from('probe_heartbeats').select('id, probe_name, status, duration_ms, occurred_at').order('occurred_at', { ascending: false }).limit(40),
    ]);

    return {
        props: {
            health: healthRes.data || null,
            heartbeats: heartbeatsRes.data || [],
            error: healthRes.error?.message || null,
            generatedAt: new Date().toISOString(),
        },
    };
}

function readLocalAccessToken() {
    try {
        return JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token || null;
    } catch (_e) {
        return null;
    }
}

const fmtAge = (iso) => {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return Math.round(ms / 1000) + 's ago';
    if (ms < 3600_000) return Math.round(ms / 60_000) + 'm ago';
    if (ms < 86400_000) return Math.round(ms / 3600_000) + 'h ago';
    return Math.round(ms / 86400_000) + 'd ago';
};

function FlowCard({ name, runs, ok, failed, lastRun, expectedCadenceMin }) {
    const stale = !lastRun || (Date.now() - new Date(lastRun).getTime()) > (expectedCadenceMin * 2 * 60_000);
    let status, color, msg;
    if (Number(failed) > 0) { status = 'FAILED'; color = '#ef4444'; msg = `${failed} failure(s) in last hour`; }
    else if (stale) { status = 'STALE'; color = '#eab308'; msg = `last run ${fmtAge(lastRun)} (cadence ~${expectedCadenceMin}m)`; }
    else { status = 'OK'; color = '#22c55e'; msg = `${ok}/${runs} ok in last 15m`; }
    return (
        <div style={{ background: '#1a2433', border: `1px solid ${color}`, borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                <span style={{ background: color, color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{status}</span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>{msg}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>last: {fmtAge(lastRun)}</div>
        </div>
    );
}

export default function AuthHealthDashboard(props) {
    const [state, setState] = useState({
        loading: !!props.clientMode,
        health: props.health || null,
        heartbeats: props.heartbeats || [],
        error: props.error || null,
        generatedAt: props.generatedAt || null,
    });

    useEffect(() => {
        if (!props.clientMode) return;
        let cancelled = false;
        (async () => {
            const token = readLocalAccessToken();
            if (!token) {
                window.location.replace('/auth/login?redirect=' + encodeURIComponent('/admin/auth-health'));
                return;
            }
            try {
                const res = await fetch('/api/admin/auth-health-data?view=auth', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.status === 401) {
                    window.location.replace('/auth/login?redirect=' + encodeURIComponent('/admin/auth-health'));
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

    const { loading, health, heartbeats, error, generatedAt } = state;
    if (loading) return <main style={S.page}><div style={S.err}>Loading auth health…</div></main>;
    if (error) return <main style={S.page}><div style={S.err}>{error}</div></main>;
    if (!health) return <main style={S.page}><div style={S.err}>No health data yet — wait for first probe runs (5–15 min after deploy).</div></main>;

    return (
        <main style={S.page}>
            <header style={S.header}>
                <div>
                    <h1 style={S.h1}>Auth Health — Unified</h1>
                    <p style={S.p}>Generated {fmtAge(generatedAt)}. <a href="/admin/auth-health" style={S.link}>↻ refresh</a> · <a href="/admin/signup-health" style={S.link}>signup-only view</a></p>
                </div>
            </header>

            <section style={S.section}>
                <h2 style={S.h2}>Flow status</h2>
                <div style={S.grid}>
                    <FlowCard name="Signup" runs={health.signup_runs_15m} ok={health.signup_ok_15m} failed={health.signup_failed_1h} lastRun={health.signup_last_run} expectedCadenceMin={5} />
                    <FlowCard name="Login" runs={health.login_runs_15m} ok={health.login_ok_15m} failed={health.login_failed_1h} lastRun={health.login_last_run} expectedCadenceMin={5} />
                    <FlowCard name="Recovery (reset + magic link)" runs={health.recovery_runs_15m} ok={health.recovery_ok_15m} failed={health.recovery_failed_1h} lastRun={health.recovery_last_run} expectedCadenceMin={15} />
                    <FlowCard name="DB integrity (nightly)" runs={health.integrity_runs_24h} ok={health.integrity_runs_24h} failed={health.integrity_failed_1h} lastRun={health.integrity_last_run} expectedCadenceMin={1440} />
                    <FlowCard name="Email deliverability (nightly)" runs={health.email_runs_24h} ok={health.email_runs_24h} failed={health.email_failed_1h} lastRun={health.email_last_run} expectedCadenceMin={1440} />
                </div>
            </section>

            <section style={S.section}>
                <h2 style={S.h2}>Real-user signal</h2>
                <div style={S.grid}>
                    <div style={S.statCard}><div style={S.statLabel}>Real signups (24h)</div><div style={{ ...S.statValue, color: Number(health.real_signups_24h) === 0 ? '#ef4444' : '#fff' }}>{health.real_signups_24h}</div></div>
                    <div style={S.statCard}><div style={S.statLabel}>Real signups (1h)</div><div style={S.statValue}>{health.real_signups_1h}</div></div>
                    <div style={S.statCard}><div style={S.statLabel}>Trigger errors (1h)</div><div style={{ ...S.statValue, color: Number(health.trigger_errors_1h) > 0 ? '#ef4444' : '#fff' }}>{health.trigger_errors_1h}</div></div>
                </div>
            </section>

            <section style={S.section}>
                <h2 style={S.h2}>Recent probe heartbeats (last 40)</h2>
                <table style={S.table}>
                    <thead><tr><th style={S.th}>When</th><th style={S.th}>Probe</th><th style={S.th}>Status</th><th style={S.th}>Duration</th></tr></thead>
                    <tbody>
                        {heartbeats.map((h) => (
                            <tr key={h.id}>
                                <td style={S.td}>{fmtAge(h.occurred_at)}</td>
                                <td style={S.td}><code>{h.probe_name}</code></td>
                                <td style={S.td}><span style={{ background: h.status === 'ok' ? '#22c55e' : h.status === 'failed' ? '#ef4444' : '#eab308', color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11 }}>{h.status}</span></td>
                                <td style={S.td}>{h.duration_ms ? `${h.duration_ms}ms` : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <footer style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #2a3a4a', color: '#6b7280', fontSize: 12 }}>
                Backed by <code>public.auth_health_view</code> + <code>probe_heartbeats</code>. Runbook: <a href="/docs/SIGNUP_RUNBOOK.md" style={S.link}>SIGNUP_RUNBOOK.md</a>.
            </footer>
        </main>
    );
}

const S = {
    page: { minHeight: '100vh', padding: 32, background: '#0a1628', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', marginBottom: 32 },
    h1: { fontSize: 28, fontWeight: 600, margin: '0 0 4px' },
    h2: { fontSize: 18, fontWeight: 600, margin: '0 0 16px' },
    p: { fontSize: 13, color: '#9ca3af', margin: 0 },
    section: { marginBottom: 32, padding: 24, background: '#0d1f35', borderRadius: 12, border: '1px solid #1e293b' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
    statCard: { background: '#1a2433', border: '1px solid #2a3a4a', borderRadius: 8, padding: 16 },
    statLabel: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
    statValue: { fontSize: 28, fontWeight: 600, marginTop: 4 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #2a3a4a', color: '#9ca3af', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' },
    td: { padding: '8px 12px', borderBottom: '1px solid #1e293b' },
    link: { color: '#00D4FF', textDecoration: 'none' },
    err: { padding: 16, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 8, color: '#fca5a5' },
};
