/**
 * /hub/admin/diamond-liability — Diamond economy liability dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 * The money view of the reward economy. 1 diamond = $0.01, so this page leads
 * with DOLLARS: outstanding liability, what we issued, what came back, and how
 * much of it genuinely left the building.
 *
 * Client-rendered shell. Browsers never attach an Authorization header to a
 * document navigation, so gating in getServerSideProps would bounce every real
 * admin into a login loop (the exact bug fixed in /admin/auth-health). Instead
 * this page renders immediately and calls /api/admin/diamond-liability with the
 * Bearer token from localStorage; that endpoint does the full admin check.
 *
 * Visual language matches pages/hub/diamond-store.js — inline style objects,
 * black canvas, cyan (#00D4FF) accent, gold for VIP/warning, red for leakage.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';

// ── Palette (same tokens as src/components/diamond-store/diamondStoreStyles) ──
const C = {
    bg: '#000000',
    panel: 'rgba(36, 37, 38, 0.95)',
    panelSoft: 'rgba(255, 255, 255, 0.05)',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#E4E6EB',
    dim: 'rgba(255, 255, 255, 0.6)',
    faint: 'rgba(255, 255, 255, 0.4)',
    cyan: '#00D4FF',
    green: '#00ff88',
    gold: '#FFD700',
    red: '#ef4444',
    blue: '#1877F2',
};

const usd = (n) =>
    (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const num = (n) => (Number(n) || 0).toLocaleString('en-US');

function readLocalAccessToken() {
    try {
        return JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token || null;
    } catch (_e) {
        return null;
    }
}

// ───────────────────────────────────────────────────────────────────────────
// PRIMITIVES
// ───────────────────────────────────────────────────────────────────────────
function Panel({ title, subtitle, children, accent }) {
    return (
        <section
            style={{
                background: C.panel,
                border: `1px solid ${accent || C.border}`,
                borderRadius: 12,
                padding: 20,
                marginBottom: 20,
            }}
        >
            {title && (
                <div style={{ marginBottom: 14 }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: accent || C.cyan, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {title}
                    </h2>
                    {subtitle && <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{subtitle}</div>}
                </div>
            )}
            {children}
        </section>
    );
}

/** Dollars big, diamonds small — the point of the whole page. */
function MoneyStat({ label, usdValue, diamonds, color, hint, big }) {
    return (
        <div
            style={{
                background: C.panelSoft,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: big ? '20px 22px' : '14px 16px',
                minWidth: 0,
            }}
        >
            <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                {label}
            </div>
            <div
                style={{
                    fontSize: big ? 34 : 24,
                    fontWeight: 800,
                    color: color || C.text,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    lineHeight: 1.1,
                    wordBreak: 'break-word',
                }}
            >
                {usdValue}
            </div>
            {diamonds !== undefined && diamonds !== null && (
                <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>{num(diamonds)} &#9670;</div>
            )}
            {hint && <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>{hint}</div>}
        </div>
    );
}

function Grid({ children, min = 200 }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>
            {children}
        </div>
    );
}

/** Dependency-free horizontal bar. */
function Bar({ label, value, total, color, right }) {
    const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, marginBottom: 5, gap: 12 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ color: color, fontWeight: 700, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>{right}</span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
            </div>
        </div>
    );
}

function Message({ tone, title, children }) {
    const color = tone === 'error' ? C.red : tone === 'warn' ? C.gold : C.cyan;
    return (
        <div
            style={{
                background: C.panel,
                border: `1px solid ${color}`,
                borderRadius: 12,
                padding: 24,
                color: C.text,
                maxWidth: 640,
                margin: '48px auto',
            }}
        >
            <div style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 10 }}>{title}</div>
            <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{children}</div>
        </div>
    );
}

// ───────────────────────────────────────────────────────────────────────────
// PAGE
// ───────────────────────────────────────────────────────────────────────────
export default function DiamondLiabilityDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [denied, setDenied] = useState(false);
    const [noToken, setNoToken] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        setDenied(false);
        setNoToken(false);

        const token = readLocalAccessToken();
        if (!token) {
            setNoToken(true);
            setLoading(false);
            return;
        }
        try {
            const res = await fetch('/api/admin/diamond-liability', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const json = await res.json().catch(() => ({}));
            if (res.status === 401) { setNoToken(true); return; }
            if (res.status === 403) { setDenied(true); return; }
            if (!res.ok) { setError(json.error || `HTTP ${res.status}`); return; }
            setData(json);
        } catch (e) {
            setError(e?.message || 'Network error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const shell = (body) => (
        <>
            <Head>
                <title>Diamond Liability | Admin | Smarter.Poker</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, -apple-system, sans-serif' }}>
                <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 20px 80px' }}>{body}</div>
            </div>
        </>
    );

    if (noToken) {
        return shell(
            <Message tone="warn" title="Not signed in">
                This dashboard exposes the platform&apos;s diamond liability and per-user earning totals, so it
                requires an admin session.{' '}
                <a href="/auth/login?redirect=/hub/admin/diamond-liability" style={{ color: C.cyan }}>Sign in</a> and
                reload.
            </Message>
        );
    }
    if (denied) {
        return shell(
            <Message tone="error" title="Forbidden — admin only">
                Your account is signed in but is not flagged <code>is_admin</code>. Nothing on this page is available
                to normal users.
            </Message>
        );
    }
    if (loading && !data) {
        return shell(<div style={{ color: C.dim, padding: '64px 0', textAlign: 'center', fontSize: 14 }}>Loading diamond liability&hellip;</div>);
    }
    if (error && !data) {
        return shell(
            <Message tone="error" title="Could not load liability data">
                {error}
                <div style={{ marginTop: 16 }}>
                    <button onClick={load} style={btnStyle}>Retry</button>
                </div>
            </Message>
        );
    }
    if (!data) return shell(<div style={{ color: C.dim }}>No data.</div>);

    const { outstanding, flow, recirculation, budget, topEarners = [], notes = [] } = data;

    const outflowTotal =
        (recirculation?.recirculated || 0) +
        (recirculation?.leaked || 0) +
        (recirculation?.transfers || 0) +
        (recirculation?.clawbacks || 0) +
        (recirculation?.unclassified || 0);

    const netColor30d = (flow?.netFlow30d || 0) > 0 ? C.red : C.green;
    const netColor24h = (flow?.netFlow24h || 0) > 0 ? C.red : C.green;
    const maxEarned = topEarners.reduce((m, e) => Math.max(m, e.diamonds || 0), 0);

    return shell(
        <>
            {/* ── HEADER ── */}
            <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff' }}>Diamond Liability</h1>
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>
                        1 &#9670; = {usd(data.usdPerDiamond ?? 0.01)} &middot; period {data.period} ({data.timezone}) &middot; generated{' '}
                        {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}
                    </div>
                </div>
                <button onClick={load} disabled={loading} style={btnStyle}>
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </header>

            {/* ── NOTES / CAVEATS ── */}
            {notes.length > 0 && (
                <Panel title="Notes" accent={C.gold}>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.dim, lineHeight: 1.7 }}>
                        {notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                </Panel>
            )}

            {/* ── OUTSTANDING ── */}
            <Panel title="Outstanding liability" subtitle="Every diamond currently sitting in a user balance, priced at face value.">
                <Grid min={240}>
                    <MoneyStat
                        big
                        label="Total outstanding"
                        usdValue={usd(outstanding?.usd)}
                        diamonds={outstanding?.diamonds}
                        color={C.cyan}
                        hint={`${num(outstanding?.users)} user balances${outstanding?.truncated ? ' (scan truncated — floor)' : ''}`}
                    />
                    <MoneyStat
                        label="Net flow — 24h"
                        usdValue={usd(flow?.netFlow24hUsd)}
                        diamonds={flow?.netFlow24h}
                        color={netColor24h}
                        hint="issued minus redeemed"
                    />
                    <MoneyStat
                        label="Net flow — 30d"
                        usdValue={usd(flow?.netFlow30dUsd)}
                        diamonds={flow?.netFlow30d}
                        color={netColor30d}
                        hint="positive = liability growing"
                    />
                </Grid>
            </Panel>

            {/* ── FLOW ── */}
            <Panel title="Issued vs redeemed" subtitle={`${num(flow?.ledgerRows)} ledger rows scanned${flow?.truncated ? ' (truncated — figures are a floor)' : ''}.`}>
                <Grid min={190}>
                    <MoneyStat label="Issued — 24h" usdValue={usd(flow?.issued24hUsd)} diamonds={flow?.issued24h} color={C.gold} />
                    <MoneyStat label="Redeemed — 24h" usdValue={usd(flow?.redeemed24hUsd)} diamonds={flow?.redeemed24h} color={C.green} />
                    <MoneyStat label="Issued — 30d" usdValue={usd(flow?.issued30dUsd)} diamonds={flow?.issued30d} color={C.gold} />
                    <MoneyStat label="Redeemed — 30d" usdValue={usd(flow?.redeemed30dUsd)} diamonds={flow?.redeemed30d} color={C.green} />
                </Grid>
            </Panel>

            {/* ── RECIRCULATION ── */}
            <Panel
                title="Recirculation vs leakage (30d)"
                subtitle="Arena/gameplay spend returns to the platform. VIP and merchandise redemptions are value that genuinely leaves."
            >
                <Grid min={190}>
                    <MoneyStat label="Recirculated (arena)" usdValue={usd(recirculation?.recirculatedUsd)} diamonds={recirculation?.recirculated} color={C.cyan} hint="tournament / arcade entries" />
                    <MoneyStat label="Leaked (VIP + merch)" usdValue={usd(recirculation?.leakedUsd)} diamonds={recirculation?.leaked} color={C.red} hint="real value out the door" />
                    <MoneyStat label="Peer transfers" usdValue={usd(recirculation?.transfersUsd)} diamonds={recirculation?.transfers} color={C.blue} hint="net-zero platform-wide" />
                    <MoneyStat label="Clawbacks" usdValue={usd(recirculation?.clawbacksUsd)} diamonds={recirculation?.clawbacks} color={C.green} hint="refunds / reversals" />
                    <MoneyStat
                        label="Unclassified"
                        usdValue={usd(recirculation?.unclassifiedUsd)}
                        diamonds={recirculation?.unclassified}
                        color={(recirculation?.unclassified || 0) > 0 ? C.gold : C.faint}
                        hint={recirculation?.unclassifiedTypes?.length ? recirculation.unclassifiedTypes.join(', ') : 'none'}
                    />
                </Grid>

                {outflowTotal > 0 && (
                    <div style={{ marginTop: 22 }}>
                        <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                            Share of all outflow
                        </div>
                        <Bar label="Recirculated — arena / gameplay" value={recirculation?.recirculated || 0} total={outflowTotal} color={C.cyan} right={usd(recirculation?.recirculatedUsd)} />
                        <Bar label="Leaked — VIP + merchandise" value={recirculation?.leaked || 0} total={outflowTotal} color={C.red} right={usd(recirculation?.leakedUsd)} />
                        <Bar label="Peer transfers" value={recirculation?.transfers || 0} total={outflowTotal} color={C.blue} right={usd(recirculation?.transfersUsd)} />
                        <Bar label="Clawbacks" value={recirculation?.clawbacks || 0} total={outflowTotal} color={C.green} right={usd(recirculation?.clawbacksUsd)} />
                        <Bar label="Unclassified" value={recirculation?.unclassified || 0} total={outflowTotal} color={C.gold} right={usd(recirculation?.unclassifiedUsd)} />
                    </div>
                )}

                {recirculation?.byType?.length > 0 && (
                    <div style={{ marginTop: 24, overflowX: 'auto' }}>
                        <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                            Outflow by transaction_type
                        </div>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>transaction_type</th>
                                    <th style={thStyle}>bucket</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>diamonds</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>usd</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recirculation.byType.map((r) => (
                                    <tr key={r.type} style={{ borderBottom: `1px solid ${C.border}` }}>
                                        <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace' }}>{r.type}</td>
                                        <td style={{ ...tdStyle, color: r.bucket === 'leaked' ? C.red : r.bucket === 'unclassified' ? C.gold : C.dim }}>{r.bucket}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>{num(r.diamonds)}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', color: C.text, fontWeight: 700 }}>{usd(r.usd)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>

            {/* ── BUDGET ── */}
            <Panel
                title="Platform monthly budget"
                subtitle="Global circuit breaker. When spent crosses budget, award_diamonds_v2 pays 0 for everyone until the month rolls."
                accent={budget ? C.border : C.gold}
            >
                {!budget ? (
                    <div style={{ fontSize: 13, color: C.gold, lineHeight: 1.7 }}>
                        No budget row available. The circuit breaker is not reporting — see Notes above. Configured
                        ceiling is {num(data.platformMonthlyBudgetConfig?.diamonds)} &#9670; (
                        {usd(data.platformMonthlyBudgetConfig?.usd)}) per month from{' '}
                        <code>src/config/diamondRewards.js</code>.
                    </div>
                ) : (
                    <>
                        <Grid min={190}>
                            <MoneyStat label="Budget" usdValue={usd(budget.budgetUsd)} diamonds={budget.budgetDiamonds} color={C.cyan} />
                            <MoneyStat label="Spent" usdValue={usd(budget.spentUsd)} diamonds={budget.spentDiamonds} color={budget.percentUsed >= 80 ? C.red : C.gold} />
                            <MoneyStat label="Remaining" usdValue={usd(budget.remainingUsd)} diamonds={budget.remainingDiamonds} color={C.green} />
                        </Grid>
                        <div style={{ marginTop: 18 }}>
                            <Bar
                                label={`${budget.period} used`}
                                value={budget.spentDiamonds}
                                total={budget.budgetDiamonds}
                                color={budget.percentUsed >= 80 ? C.red : C.cyan}
                                right={budget.percentUsed === null ? '—' : `${budget.percentUsed}%`}
                            />
                        </div>
                    </>
                )}
            </Panel>

            {/* ── TOP EARNERS ── */}
            <Panel
                title="Top earners — 30d"
                subtitle={`Abuse-detection surface. Monthly cap: ${num(data.monthlyCap?.free)} ◆ free / ${num(data.monthlyCap?.vip)} ◆ VIP.`}
            >
                {topEarners.length === 0 ? (
                    <div style={{ fontSize: 13, color: C.faint }}>No positive diamond awards in the last 30 days.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>#</th>
                                    <th style={thStyle}>user</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>earned 30d</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>usd</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>balance</th>
                                    <th style={thStyle}>vs cap</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topEarners.map((e, i) => (
                                    <tr key={e.userId} style={{ borderBottom: `1px solid ${C.border}`, background: e.overCap ? 'rgba(239,68,68,0.08)' : 'transparent' }}>
                                        <td style={{ ...tdStyle, color: C.faint }}>{i + 1}</td>
                                        <td style={tdStyle}>
                                            <div style={{ color: C.text, fontWeight: 600 }}>
                                                {e.username || <span style={{ color: C.faint }}>(no username)</span>}
                                                {e.isVip && <span style={vipPill}>VIP</span>}
                                            </div>
                                            <div style={{ fontSize: 10, color: C.faint, fontFamily: 'ui-monospace, monospace' }}>{e.userId}</div>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>{num(e.diamonds)}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: C.text }}>{usd(e.usd)}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', color: C.dim }}>{e.balance === null ? '—' : num(e.balance)}</td>
                                        <td style={tdStyle}>
                                            {e.overCap ? (
                                                <span style={{ color: C.red, fontWeight: 700 }}>
                                                    OVER by {num(e.overCapBy)} &#9670;
                                                </span>
                                            ) : (
                                                <span style={{ color: C.faint }}>within {num(e.monthlyCap)} &#9670;</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>

            {error && (
                <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>Last refresh failed: {error}</div>
            )}
        </>
    );
}

// ── shared inline style objects ──
const btnStyle = {
    padding: '10px 20px',
    background: 'rgba(0, 212, 255, 0.15)',
    border: `1px solid ${C.cyan}`,
    borderRadius: 10,
    color: C.cyan,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
};

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 };

const thStyle = {
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: C.faint,
    borderBottom: `1px solid ${C.border}`,
    fontWeight: 700,
};

const tdStyle = { padding: '10px', color: C.dim, verticalAlign: 'top' };

const vipPill = {
    marginLeft: 8,
    fontSize: 9,
    fontWeight: 800,
    color: '#000',
    background: C.gold,
    padding: '2px 6px',
    borderRadius: 4,
    letterSpacing: 0.5,
};
