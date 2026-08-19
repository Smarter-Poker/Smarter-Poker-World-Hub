/**
 * /admin/push-health -- operator view of the push stack.
 *
 * The number that matters most on this page is "confirmed on device", which
 * comes from last_receipt_at (the service worker beacon), not from send
 * results. Push services return 2xx for dead endpoints, so a page built on send
 * results would show green while every phone stayed silent.
 */
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { getAccessToken } from '../../src/lib/authUtils';

const STATUS_LABEL = {
    ok: 'Reachable',
    zombie: 'No delivery confirmed',
    subscription_dead: 'Subscription dead',
    never_enabled: 'Never enabled',
};

const STATUS_COLOR = {
    ok: '#10B981',
    zombie: '#F59E0B',
    subscription_dead: '#EF4444',
    never_enabled: '#6B7280',
};

export default function PushHealthPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const token = getAccessToken();
                const res = await fetch('/api/admin/push-health-data', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                const json = await res.json();
                if (!res.ok) { setError(json?.error || `Failed (${res.status})`); return; }
                setData(json);
            } catch (e) {
                setError(e?.message || 'Failed to load');
            }
        })();
    }, []);

    return (
        <>
            <Head><title>Push Health | Smarter Poker Admin</title><meta name="robots" content="noindex" /></Head>
            <div style={{ minHeight: '100vh', background: '#0B1120', color: '#fff', padding: 24 }}>
                <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Push Health</h1>
                    <p style={{ color: '#9CA3AF', fontSize: 14, marginTop: 4 }}>
                        Delivery is measured by service worker receipts, not by what the push service accepted.
                    </p>

                    {error && <p style={{ color: '#FCA5A5', marginTop: 20 }}>{error}</p>}
                    {!data && !error && <p style={{ color: '#6B7280', marginTop: 20 }}>Loading...</p>}

                    {data && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 20 }}>
                                <Stat label="VAPID configured" value={data.config.configured ? 'Yes' : 'NO'} bad={!data.config.configured} />
                                <Stat label="Keys match" value={data.config.keyMatches ? 'Yes' : 'NO'} bad={!data.config.keyMatches} />
                                <Stat label="Active devices" value={data.subscriptions.active} />
                                <Stat label="Unconfirmed devices" value={data.subscriptions.zombies} bad={data.subscriptions.zombies > 0} />
                                <Stat label="Sent (24h)" value={data.outbox.sentLast24h} />
                                <Stat label="Queue backlog" value={data.outbox.pending} bad={data.outbox.pending > 250} />
                                <Stat label="Failed" value={data.outbox.failed} bad={data.outbox.failed > 0} />
                                <Stat
                                    label="Dispatcher last ran"
                                    value={data.dispatch.minutesSince == null ? 'never' : `${data.dispatch.minutesSince}m ago`}
                                    bad={data.dispatch.minutesSince == null || data.dispatch.minutesSince > 30}
                                />
                            </div>

                            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>Staff Reachability</h2>
                            <div style={{ marginTop: 12, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden' }}>
                                {data.staff.length === 0 && (
                                    <p style={{ padding: 16, color: '#6B7280', margin: 0 }}>No staff accounts found.</p>
                                )}
                                {data.staff.map((s) => (
                                    <div key={s.id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    }}>
                                        <div style={{ minWidth: 0 }}>
                                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                                                {s.username || s.email || s.id.slice(0, 8)}
                                            </p>
                                            <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
                                                {s.role} - {s.devices} active device{s.devices === 1 ? '' : 's'}
                                                {s.lastFailure ? ` - last error: ${s.lastFailure}` : ''}
                                            </p>
                                        </div>
                                        <span style={{
                                            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                                            color: STATUS_COLOR[s.status] || '#9CA3AF',
                                        }}>
                                            {STATUS_LABEL[s.status] || s.status}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>Recent Dispatch Runs</h2>
                            <div style={{ marginTop: 12, fontSize: 13, color: '#9CA3AF' }}>
                                {data.dispatch.recent.length === 0 && <p style={{ margin: 0 }}>No runs recorded yet.</p>}
                                {data.dispatch.recent.map((r, i) => (
                                    <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        {new Date(r.started_at).toLocaleString()} - claimed {r.claimed}, sent {r.sent},
                                        failed {r.failed}, skipped {r.skipped}
                                        {r.note ? ` (${r.note})` : ''}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

function Stat({ label, value, bad }) {
    return (
        <div style={{
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
            padding: 14, background: '#111827',
        }}>
            <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>{label}</p>
            <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, color: bad ? '#F87171' : '#fff' }}>
                {value}
            </p>
        </div>
    );
}
