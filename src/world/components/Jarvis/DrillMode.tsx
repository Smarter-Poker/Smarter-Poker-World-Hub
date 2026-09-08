import React from 'react';

interface DrillModeProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

const VERIFIED_DRILL_ROUTE = '/hub/training?source=jarvis-drill';

/**
 * The legacy mini-drill graded a client-side answer bank. Jarvis remains an
 * entry point only; canonical Training routes own signed attempts and grading.
 */
export function DrillMode({ onClose }: DrillModeProps) {
    const openVerifiedDrills = () => {
        if (typeof window !== 'undefined') window.location.assign(VERIFIED_DRILL_ROUTE);
    };

    return (
        <div style={{
            background: 'linear-gradient(155deg, rgba(19, 31, 45, 0.99), rgba(3, 10, 18, 0.99))',
            border: '1px solid rgba(106, 220, 255, 0.45)',
            borderRadius: '12px',
            padding: '18px',
            maxWidth: '380px',
            color: '#eefaff',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.48), inset 0 1px rgba(255, 255, 255, 0.08)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                    <div style={{ color: '#78ddff', fontSize: '10px', letterSpacing: '0.16em' }}>
                        Verified Training
                    </div>
                    <h4 style={{ margin: '6px 0 8px', fontSize: '17px' }}>Training Drill Library</h4>
                </div>
                {onClose && (
                    <button
                        type="button"
                        aria-label="Close Training Drill Launcher"
                        onClick={onClose}
                        style={{ background: 'none', border: 0, color: '#bfefff', fontSize: '20px', cursor: 'pointer' }}
                    >
                        ×
                    </button>
                )}
            </div>
            <p style={{ margin: '0 0 16px', color: 'rgba(238, 250, 255, 0.76)', fontSize: '12px', lineHeight: 1.55 }}>
                Choose A Canonical Game So Every Spot Uses Server-Delivered Questions, Server Grading, And Verified Progress.
            </p>
            <button
                type="button"
                onClick={openVerifiedDrills}
                style={{
                    width: '100%', padding: '12px 14px', border: '1px solid #8fe8ff', borderRadius: '8px',
                    background: 'linear-gradient(180deg, #49cfff, #087eaa)', color: '#031018', fontSize: '12px',
                    fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 22px rgba(28, 183, 234, 0.25)'
                }}
            >
                Open Verified Training Games
            </button>
        </div>
    );
}
