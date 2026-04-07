import React from 'react';
import { useRouter } from 'next/router';

export default function PokerTourCard({ tourPin }) {
    const router = useRouter();
    // Default to circuit styling as fallback
    const colors = { bg: '#101742', border: '#25359a', text: '#93a5ff' }; 
    const typeInfo = { label: 'Tour Stop', color: '#60a5fa' };

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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 11, letterSpacing: '0.3px' }}>
                        LIVE NOW
                    </span>
                </div>
                {tourPin.stop_venue && <span className="tour-stop-venue" style={{ display: 'block', fontSize: 15, fontWeight: 600, marginTop: 4 }}>{tourPin.stop_venue}</span>}
                <span className="tour-stop-location" style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 }}>{tourPin.location || (tourPin.city + ', ' + tourPin.state)}</span>
            </div>

            {/* Card Footer */}
            <div className="tour-card-footer" style={{ marginTop: 16 }}>
                <div className="tour-card-actions" style={{ marginLeft: 'auto' }}>
                    <span className="tour-action-btn primary">Details</span>
                </div>
            </div>
            
            <style jsx>{`
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
