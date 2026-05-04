/**
 * LiveAnalyticsCard — Post-stream stats shown after ending a broadcast
 * Displays peak viewers, duration, comments, reactions, diamonds received
 */
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const STAT_ITEMS = [
    { key: 'peak_viewers', label: 'Peak Viewers', icon: '👁️', color: '#0066FF' },
    { key: 'duration_seconds', label: 'Duration', icon: '⏱️', color: '#8B5CF6', format: 'duration' },
    { key: 'comment_count', label: 'Comments', icon: '💬', color: '#10B981' },
    { key: 'reaction_count', label: 'Total Reactions', icon: '🎉', color: '#FA383E' },
    { key: 'total_gifts_received', label: 'Diamonds Received', icon: '💎', color: '#F59E0B' },
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
        const load = async () => {
            try {
                const { data } = await supabase
                    .from('live_stream_analytics')
                    .select('*')
                    .eq('id', streamId)
                    .maybeSingle();
                if (!cancelled) setAnalytics(data);
            } catch (e) {
                console.warn('[analytics] failed:', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        // Short delay so DB has time to aggregate
        // FIX: store timer so cleanup can cancel it on unmount
        const timer = setTimeout(load, 1500);
        return () => { cancelled = true; clearTimeout(timer); };
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
                <div style={{ fontSize: 48, marginBottom: 8 }}>🎬</div>
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
                                    <div style={{ fontSize: 28, marginBottom: 6 }}>{item.icon}</div>
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
