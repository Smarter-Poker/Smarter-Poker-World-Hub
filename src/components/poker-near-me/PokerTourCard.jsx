/**
 * NOT CURRENTLY MOUNTED. A repo-wide grep finds no import of PokerTourCard — the
 * rendered tour card is RichTourCard. It is kept (rather than deleted) in case it is
 * revived, with the structural defects below fixed so a revival does not ship them.
 */
import React from 'react';
import { useRouter } from 'next/router';

// BUG FIX: `colors` and `typeInfo` were hardcoded literals despite the comment
// "Default to circuit styling as fallback", so every tour rendered in identical
// colours and was labelled "Tour Stop" whatever its type. Derive from tour_type.
const TOUR_TYPE_STYLES = {
    major:       { colors: { bg: '#3b1f05', border: '#a16207', text: '#fbbf24' }, label: 'Major Tour', color: '#fbbf24' },
    circuit:     { colors: { bg: '#101742', border: '#25359a', text: '#93a5ff' }, label: 'Circuit', color: '#60a5fa' },
    regional:    { colors: { bg: '#052e26', border: '#047857', text: '#6ee7b7' }, label: 'Regional', color: '#34d399' },
    high_roller: { colors: { bg: '#2e1065', border: '#5b21b6', text: '#c4b5fd' }, label: 'High Roller', color: '#a78bfa' },
    grassroots:  { colors: { bg: '#1f2937', border: '#4b5563', text: '#d1d5db' }, label: 'Grassroots', color: '#9ca3af' },
    charity:     { colors: { bg: '#172554', border: '#1d4ed8', text: '#93c5fd' }, label: 'Charity', color: '#60a5fa' },
};
const DEFAULT_TOUR_STYLE = { colors: { bg: '#101742', border: '#25359a', text: '#93a5ff' }, label: 'Tour Stop', color: '#60a5fa' };

/** True only when today falls inside the stop's own date range. */
function isStopLiveNow(tourPin) {
    const startRaw = tourPin?.stop_start_date || tourPin?.start_date;
    if (!startRaw) return false;
    // Parse as a LOCAL date — new Date('YYYY-MM-DD') is UTC midnight and reads back
    // as the previous day in every US timezone.
    const toLocalDate = (raw) => {
        const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return isNaN(d.getTime()) ? null : d;
    };
    const start = toLocalDate(startRaw);
    if (!start) return false;
    const end = toLocalDate(tourPin?.stop_end_date || tourPin?.end_date) || start;
    end.setHours(23, 59, 59, 999);
    const now = new Date();
    return now >= start && now <= end;
}

export default function PokerTourCard({ tourPin = {} }) {
    const router = useRouter();
    const style = TOUR_TYPE_STYLES[tourPin.tour_type] || DEFAULT_TOUR_STYLE;
    const colors = style.colors;
    const typeInfo = { label: style.label, color: style.color };
    // BUG FIX: the green "LIVE NOW" badge was unconditional, with no date check —
    // every tour claimed to be running right now.
    const liveNow = isStopLiveNow(tourPin);
    // BUG FIX: `tourPin.city + ', ' + tourPin.state` printed the literal
    // "undefined, undefined" whenever those fields were absent.
    const locationText = tourPin.location || [tourPin.city, tourPin.state].filter(Boolean).join(', ');

    return (
        <div 
            className="tour-card-premium" 
            style={{ marginBottom: 16 }}
            onClick={() => {
                if (tourPin.tour_code) router.push('/hub/tours/' + tourPin.tour_code);
            }}
        >
            {/* Card Header */}
            <div className="tour-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {tourPin.logo_url && (
                        <div className="tour-logo-container">
                            <img src={tourPin.logo_url} alt="Logo" className="tour-logo-img" />
                        </div>
                    )}
                    <div className="tour-code-badge" style={{ background: colors.bg, border: '1px solid ' + colors.border }}>
                        <span style={{ color: colors.text, fontSize: 14, fontWeight: 800, letterSpacing: '0.5px' }}>
                            {tourPin.tour_code || 'TOUR'}
                        </span>
                    </div>
                </div>
                <span className="tour-type-pill" style={{ color: typeInfo.color, borderColor: typeInfo.color + '40', background: typeInfo.color + '15' }}>
                    {typeInfo.label}
                </span>
            </div>

            {/* Tour Name */}
            <h4 className="tour-card-name" style={{ marginTop: 12 }}>{tourPin.tour_name || tourPin.name}</h4>

            {/* Current Location (Live) */}
            <div className="tour-card-location-live" style={{ marginTop: 12 }}>
                {liveNow && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                        </svg>
                        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 11, letterSpacing: '0.3px' }}>
                            LIVE NOW
                        </span>
                    </div>
                )}
                {tourPin.stop_venue && <span className="tour-stop-venue" style={{ display: 'block', fontSize: 15, fontWeight: 600, marginTop: 4 }}>{tourPin.stop_venue}</span>}
                {locationText && (
                    <span className="tour-stop-location" style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 }}>{locationText}</span>
                )}
            </div>

            {/* Card Footer */}
            <div className="tour-card-footer" style={{ marginTop: 16 }}>
                <div className="tour-card-actions" style={{ marginLeft: 'auto' }}>
                    <span className="tour-action-btn primary">Details</span>
                </div>
            </div>
            
            <style>{`
                .tour-card-premium {
                    background: linear-gradient(180deg, #0f1524 0%, #080b13 100%);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 16px;
                    padding: 16px;
                    cursor: pointer;
                    transition: all 0.3s;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                }
                .tour-card-premium:hover {
                    border-color: rgba(212,168,83,0.3);
                    transform: translateY(-2px);
                }
                .tour-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .tour-logo-container {
                    width: 32px; height: 32px; border-radius: 6px; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center;
                }
                .tour-logo-img { width: 100%; height: 100%; object-fit: contain; }
                .tour-code-badge { padding: 4px 10px; border-radius: 6px; }
                .tour-type-pill { padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; border: 1px solid; }
                .tour-card-name { font-size: 18px; font-weight: 800; color: #fff; margin: 0; }
                .tour-card-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 14px; }
                .tour-action-btn { padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; background: rgba(255,255,255,0.08); color: #fff; }
                .tour-action-btn.primary { background: linear-gradient(135deg, #d4a853, #b8860b); color: #000; }
            `}</style>
        </div>
    );
}
