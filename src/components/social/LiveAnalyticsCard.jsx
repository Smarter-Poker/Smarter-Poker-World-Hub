/**
 * LiveAnalyticsCard — Post-stream stats shown after ending a broadcast
 * Displays peak viewers, duration, comments, reactions, diamonds received
 */
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const STAT_ITEMS = [
    { key: 'peak_viewers', label: 'Peak Viewers', icon: null, color: '#0066FF' },
    { key: 'duration_seconds', label: 'Duration', icon: null, color: '#8B5CF6', format: 'duration' },
    { key: 'comment_count', label: 'Comments', icon: null, color: '#10B981' },
    { key: 'reaction_count', label: 'Total Reactions', icon: null, color: '#FA383E' },
    { key: 'total_gifts_received', label: 'Diamonds Received', icon: null, color: '#F59E0B' },
];

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function LiveAnalyticsCard({ streamId, onContinue }) {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!streamId) return;
        let cancelled = false;

        // BUG-FIX-DEEP-AUDIT-R5 AC-4: replace the fixed 1.5s delay with
        // a bounded retry-on-null. The live_stream_analytics view is
        // computed live via subqueries on live_reactions / live_comments
        // / live_gifts — there's no separate aggregation step. But the
        // row may briefly be absent if the broadcaster ends-then-loads-
        // analytics in <100ms (the live_streams row's ended_at gets set
        // and the view picks it up almost immediately, but the upstream
        // 'mark ended' SQL transaction may still be committing). Three
        // attempts at 500ms / 1500ms / 3500ms handles every observed lag
        // without making the UI feel sluggish on the common case.
        const ATTEMPTS = [500, 1500, 3500];
        let attemptTimers = [];

        const tryLoad = async (delayMs) => {
            const timer = setTimeout(async () => {
                if (cancelled) return;
                try {
                    const { data } = await supabase
                        .from('live_stream_analytics')
                        .select('*')
                        .eq('id', streamId)
                        .maybeSingle();
                    if (cancelled) return;
                    if (data) {
                        setAnalytics(data);
                        setLoading(false);
                    }
                } catch (e) {
                    console.warn('[analytics] failed:', e);
                }
            }, delayMs);
            attemptTimers.push(timer);
        };

        ATTEMPTS.forEach(d => tryLoad(d));

        // Final fallback: after the longest attempt window, force-stop
        // loading and show whatever we have (zeros if no row landed).
        const finalTimer = setTimeout(() => {
            if (!cancelled) setLoading(false);
        }, ATTEMPTS[ATTEMPTS.length - 1] + 500);
        attemptTimers.push(finalTimer);

        return () => {
            cancelled = true;
            attemptTimers.forEach(t => clearTimeout(t));
        };
    }, [streamId]);

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
            zIndex: 10001, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            overflowY: 'auto', padding: 'max(40px, env(safe-area-inset-top, 40px)) 24px max(40px, env(safe-area-inset-bottom, 40px))',
        }}>
            <div style={{
                background: 'linear-gradient(135deg, #0A0A1A 0%, #1A0A2E 100%)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 24,
                padding: 32,
                width: '100%',
                maxWidth: 420,
                textAlign: 'center',
            }}>
                {/* Header */}
                {/* Header — no emoji per platform standard */}
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: 'rgba(250,56,62,0.15)', border: '1px solid rgba(250,56,62,0.4)',
                    borderRadius: 8, padding: '4px 12px', marginBottom: 12,
                }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FA383E', display: 'inline-block' }} />
                    <span style={{ color: '#FA383E', fontSize: 12, fontWeight: 700, letterSpacing: 1.5 }}>LIVE ENDED</span>
                </div>
                <h2 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>
                    Stream Ended
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: '0 0 28px' }}>
                    Here's how your stream performed
                </p>

                {loading ? (
                    <div style={{ color: 'rgba(255,255,255,0.4)', padding: '32px 0', fontSize: 14 }}>
                        Calculating stats...
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
                        {STAT_ITEMS.map(item => {
                            let value = analytics?.[item.key] ?? 0;
                            if (item.format === 'duration') value = formatDuration(value);
                            return (
                                <div key={item.key} style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    borderRadius: 16,
                                    padding: '16px 12px',
                                    border: `1px solid ${item.color}33`,
                                    gridColumn: item.key === 'total_gifts_received' ? 'span 2' : 'span 1',
                                }}>
                                    <div style={{
                                        width: 10, height: 10, borderRadius: '50%',
                                        background: item.color, margin: '0 auto 8px',
                                    }} />
                                    <div style={{
                                        fontSize: 28, fontWeight: 800,
                                        color: item.color, fontVariantNumeric: 'tabular-nums',
                                    }}>
                                        {typeof value === 'number' ? value.toLocaleString() : value}
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>
                                        {item.label}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <button
                    onClick={onContinue}
                    style={{
                        width: '100%',
                        padding: '14px 0',
                        background: 'linear-gradient(135deg, #0066FF, #0044CC)',
                        color: 'white',
                        fontSize: 16,
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: 12,
                        cursor: 'pointer',
                    }}
                >
                    Save or Post Replay
                </button>
            </div>
        </div>
    );
}

export default LiveAnalyticsCard;
