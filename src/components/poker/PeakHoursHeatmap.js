/**
 * PeakHoursHeatmap — Visual heatmap for venue activity patterns
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches and displays hourly and daily activity patterns for a venue.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { useFeatureGate } from '../gates/FeatureGatePopup';

const T = {
    text: '#E4E6EB',
    textSec: '#B0B3B8',
    border: '#3E4042',
    gold: '#FFD700',
};

function intensityColor(intensity) {
    if (intensity <= 0) return 'rgba(255,255,255,0.03)';
    if (intensity < 0.25) return 'rgba(79,172,254,0.15)';
    if (intensity < 0.5) return 'rgba(79,172,254,0.35)';
    if (intensity < 0.75) return 'rgba(255,215,0,0.45)';
    return 'rgba(255,215,0,0.7)';
}

export default function PeakHoursHeatmap({ venueId }) {
    const { hasAccess: allowed, guardAction, UpgradePopup } = useFeatureGate('poker_near_me');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!venueId || !allowed) {
            setLoading(false);
            return;
        }
        let mounted = true;
        const controller = new AbortController();
        setLoading(true);
        fetch(`/api/poker/venue-activity?venueId=${venueId}`, { signal: controller.signal })
            .then(r => r.json())
            .then(d => { if (mounted) { setData(d); setLoading(false); } })
            .catch(e => { if (mounted && e.name !== 'AbortError') { setError(e.message); setLoading(false); } });
        return () => { mounted = false; controller.abort(); };
    }, [venueId, allowed]);

    if (loading) return <div style={{ color: T.textSec, fontSize: 13, padding: 12 }}>Loading activity data...</div>;
    
    // Gated View
    if (!allowed) {
        return (
            <div style={{ position: 'relative', marginTop: 12, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ filter: 'blur(8px)', opacity: 0.5, pointerEvents: 'none' }}>
                    {/* Fake Skeleton Data */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                        <div style={{ flex: 1, minWidth: 130, background: 'rgba(255,215,0,0.05)', border: `1px solid ${T.gold}22`, borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ fontSize: 10, color: T.textSec, letterSpacing: 1 }}>Peak Hour</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: T.gold }}>9:00 PM</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 130, background: 'rgba(79,172,254,0.05)', border: `1px solid rgba(79,172,254,0.2)`, borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ fontSize: 10, color: T.textSec, letterSpacing: 1 }}>Busiest Day</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#4facfe' }}>Saturday</div>
                        </div>
                    </div>
                </div>
                
                {/* Lock Overlay */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.4)', borderRadius: 10, zIndex: 10, padding: 16, textAlign: 'center'
                }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}></div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Peak Hours Intelligence</div>
                    <div style={{ fontSize: 12, color: T.textSec, marginBottom: 12 }}>Unlock to see when games are best</div>
                    <button
                        onClick={() => guardAction(() => {})}
                        style={{
                            padding: '6px 14px', borderRadius: 8, background: 'rgba(255,215,0,0.1)',
                            border: `1px solid ${T.gold}44`, color: T.gold, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                        }}
                    >
                        Unlock Feature
                    </button>
                    {UpgradePopup}
                </div>
            </div>
        );
    }

    if (error || !data?.hasData) {
        return (
            <div style={{
                background: 'rgba(255,255,255,0.02)', borderRadius: 10,
                border: `1px solid ${T.border}`, padding: 16,
                color: T.textSec, fontSize: 13, textAlign: 'center',
            }}>
                Activity Heatmap Not Yet Available — Needs Historical Data
            </div>
        );
    }

    const { hourlyActivity, weekdayActivity, peakHour, peakDay } = data;

    return (
        <div style={{ marginTop: 12 }}>
            {/* Peak Summary */}
            <div style={{
                display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap',
            }}>
                <div style={{
                    flex: 1, minWidth: 130, background: 'rgba(255,215,0,0.05)',
                    border: `1px solid ${T.gold}22`, borderRadius: 10, padding: '10px 14px',
                }}>
                    <div style={{ fontSize: 10, color: T.textSec, textTransform: 'uppercase', letterSpacing: 1 }}>Peak Hour</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: T.gold }}>{peakHour}</div>
                </div>
                <div style={{
                    flex: 1, minWidth: 130, background: 'rgba(79,172,254,0.05)',
                    border: `1px solid rgba(79,172,254,0.2)`, borderRadius: 10, padding: '10px 14px',
                }}>
                    <div style={{ fontSize: 10, color: T.textSec, textTransform: 'uppercase', letterSpacing: 1 }}>Busiest Day</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#4facfe' }}>{peakDay}</div>
                </div>
            </div>

            {/* Hourly Bar Chart (condensed) */}
            <div style={{
                background: 'rgba(255,255,255,0.02)', borderRadius: 10,
                border: `1px solid ${T.border}`, padding: 14,
            }}>
                <div style={{ fontSize: 12, color: T.textSec, fontWeight: 600, marginBottom: 10, letterSpacing: 0.5 }}>
                    Hourly Activity
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
                    {hourlyActivity.map((h, i) => (
                        <div
                            key={i}
                            title={`${h.label}: Avg ${h.avgPlayers} players`}
                            style={{
                                flex: 1, minWidth: 0,
                                height: `${Math.max(4, h.intensity * 100)}%`,
                                background: intensityColor(h.intensity),
                                borderRadius: '3px 3px 0 0',
                                transition: 'height 0.3s ease',
                            }}
                        />
                    ))}
                </div>
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 4,
                }}>
                    <span>12AM</span>
                    <span>6AM</span>
                    <span>12PM</span>
                    <span>6PM</span>
                    <span>12AM</span>
                </div>
            </div>

            {/* Weekly Heat Grid */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 4, marginTop: 10,
            }}>
                {weekdayActivity.map((d, i) => (
                    <div
                        key={i}
                        title={`${d.label}: Avg ${d.avgPlayers} players`}
                        style={{
                            background: intensityColor(d.intensity),
                            borderRadius: 6, padding: '8px 4px', textAlign: 'center',
                            border: `1px solid ${T.border}`,
                        }}
                    >
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.textSec }}>{d.shortLabel}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginTop: 2 }}>
                            {d.avgPlayers > 0 ? d.avgPlayers : '-'}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
