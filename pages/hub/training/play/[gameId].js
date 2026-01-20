import { useRouter } from 'next/router';
import { useState } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICM FUNDAMENTALS - STATIC UI LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * High-fidelity poker table interface with video game aesthetic.
 * Dark mode, neon cyan/gold accents, 8-handed table.
 */
export default function ICMFundamentalsGame() {
    const router = useRouter();
    const [selectedAction, setSelectedAction] = useState(null);

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f2e 100%)',
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            overflow: 'hidden'
        }}>
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TOP HEADER */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 24px',
                background: 'rgba(0, 0, 0, 0.5)',
                borderBottom: '2px solid rgba(34, 211, 238, 0.3)'
            }}>
                {/* Back Button */}
                <button
                    onClick={() => router.push('/hub/training')}
                    style={{
                        background: 'rgba(34, 211, 238, 0.1)',
                        border: '2px solid #22d3ee',
                        borderRadius: 8,
                        padding: '8px 16px',
                        color: '#22d3ee',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(34, 211, 238, 0.2)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(34, 211, 238, 0.1)'}
                >
                    ← Back to Training
                </button>

                {/* Title */}
                <h1 style={{
                    fontSize: 28,
                    fontWeight: 700,
                    letterSpacing: 3,
                    color: '#22d3ee',
                    textShadow: '0 0 20px rgba(34, 211, 238, 0.5)',
                    margin: 0
                }}>
                    ICM FUNDAMENTALS
                </h1>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{
                        background: 'rgba(251, 191, 36, 0.1)',
                        border: '2px solid #fbbf24',
                        borderRadius: 8,
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                    }}>
                        <span style={{ fontSize: 18 }}>⚡</span>
                        <span style={{ color: '#fbbf24', fontWeight: 600 }}>1,250 XP</span>
                    </div>
                    <div style={{
                        background: 'rgba(34, 211, 238, 0.1)',
                        border: '2px solid #22d3ee',
                        borderRadius: 8,
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                    }}>
                        <span style={{ fontSize: 18 }}>💎</span>
                        <span style={{ color: '#22d3ee', fontWeight: 600 }}>500</span>
                    </div>
                    <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        border: '2px solid #22d3ee'
                    }} />
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* PROMPT BANNER */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{
                margin: '16px 24px',
                background: 'rgba(0, 0, 0, 0.6)',
                border: '2px solid #22d3ee',
                borderRadius: 12,
                padding: '20px 32px',
                textAlign: 'center',
                boxShadow: '0 0 30px rgba(34, 211, 238, 0.3)'
            }}>
                <p style={{
                    fontSize: 20,
                    fontWeight: 600,
                    margin: 0,
                    lineHeight: 1.4
                }}>
                    You Are On The <span style={{ color: '#fbbf24' }}>Button</span> (Last To Act).
                    The Player To Your Right Bets <span style={{ color: '#ef4444' }}>2.5 Big Blinds</span>.
                    What Is Your Best Move?
                </p>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* POKER TABLE */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{
                position: 'relative',
                width: '90%',
                maxWidth: 900,
                height: 'calc(100vh - 320px)',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {/* Table Surface */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '85%',
                    background: 'linear-gradient(135deg, #1e3a1e, #0f2a0f)',
                    borderRadius: '50%',
                    border: '8px solid #fbbf24',
                    boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 0 40px rgba(251, 191, 36, 0.3)'
                }}>
                    {/* Center Pot */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(0, 0, 0, 0.7)',
                        border: '2px solid #fbbf24',
                        borderRadius: 20,
                        padding: '8px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}>
                        <span style={{ fontSize: 24 }}>🪙</span>
                        <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 18 }}>Pot 0</span>
                    </div>

                    {/* Table Branding */}
                    <div style={{
                        position: 'absolute',
                        top: '60%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8' }}>ICM Fundamentals</div>
                        <div style={{ fontSize: 14, color: '#fbbf24' }}>Smarter.Poker</div>
                    </div>

                    {/* ═══════════════════════════════════════════════════════════ */}
                    {/* PLAYER SEATS (8-Handed) */}
                    {/* ═══════════════════════════════════════════════════════════ */}
                    {renderPlayerSeats()}
                </div>

                {/* Timer (Left of Hero) */}
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    left: 60,
                    background: 'rgba(239, 68, 68, 0.9)',
                    border: '3px solid #dc2626',
                    borderRadius: 12,
                    padding: '16px 24px',
                    fontSize: 48,
                    fontWeight: 700,
                    color: '#fff',
                    boxShadow: '0 0 20px rgba(239, 68, 68, 0.5)'
                }}>
                    15
                </div>

                {/* Question Counter (Right of Hero) */}
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    right: 60,
                    background: 'rgba(34, 211, 238, 0.2)',
                    border: '2px solid #22d3ee',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#22d3ee'
                }}>
                    Question 1 of 20
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ACTION BAR (Bottom) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                borderTop: '2px solid rgba(34, 211, 238, 0.3)',
                padding: '16px 24px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12
            }}>
                {renderActionButton('Fold', '#ef4444')}
                {renderActionButton('Call', '#3b82f6')}
                {renderActionButton('Raise to 8bb', '#8b5cf6')}
                {renderActionButton('All-In', '#10b981')}
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    function renderPlayerSeats() {
        const seats = [
            { id: 1, name: 'Villain 1', stack: '32 BB', avatar: '🦊', position: { bottom: '8%', left: '50%', transform: 'translateX(-50%)' } },
            { id: 2, name: 'Villain 2', stack: '28 BB', avatar: '🧙', position: { bottom: '25%', left: '15%' } },
            { id: 3, name: 'Villain 3', stack: '55 BB', avatar: '🥷', position: { top: '35%', left: '8%' } },
            { id: 4, name: 'Villain 4', stack: '41 BB', avatar: '🐺', position: { top: '15%', left: '25%' } },
            { id: 5, name: 'Villain 5', stack: '38 BB', avatar: '⚔️', position: { top: '15%', right: '25%' } },
            { id: 6, name: 'Villain 6', stack: '62 BB', avatar: '👑', position: { top: '35%', right: '8%' } },
            { id: 7, name: 'Villain 7', stack: '29 BB', avatar: '🏴‍☠️', position: { bottom: '25%', right: '15%' } },
            { id: 8, name: 'Villain 8', stack: '51 BB', avatar: '🤠', position: { bottom: '15%', right: '22%' } }
        ];

        return (
            <>
                {/* Villains */}
                {seats.map(seat => (
                    <div key={seat.id} style={{
                        position: 'absolute',
                        ...seat.position,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8
                    }}>
                        {/* Avatar */}
                        <div style={{
                            width: 60,
                            height: 60,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #1e293b, #334155)',
                            border: '3px solid #475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 32
                        }}>
                            {seat.avatar}
                        </div>
                        {/* Stack */}
                        <div style={{
                            background: 'rgba(0, 0, 0, 0.9)',
                            border: '2px solid #fbbf24',
                            borderRadius: 8,
                            padding: '4px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fbbf24'
                        }}>
                            {seat.name}<br />{seat.stack}
                        </div>
                    </div>
                ))}

                {/* Hero (Bottom Center) */}
                <div style={{
                    position: 'absolute',
                    bottom: '8%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12
                }}>
                    {/* Cards */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{
                            width: 60,
                            height: 85,
                            background: '#fff',
                            borderRadius: 8,
                            border: '2px solid #000',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 32,
                            color: '#ef4444',
                            fontWeight: 700,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                        }}>
                            A<div style={{ fontSize: 24 }}>♥</div>
                        </div>
                        <div style={{
                            width: 60,
                            height: 85,
                            background: '#fff',
                            borderRadius: 8,
                            border: '2px solid #000',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 32,
                            color: '#ef4444',
                            fontWeight: 700,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                        }}>
                            K<div style={{ fontSize: 24 }}>♥</div>
                        </div>
                    </div>

                    {/* Avatar */}
                    <div style={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                        border: '4px solid #22d3ee',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 40,
                        boxShadow: '0 0 30px rgba(34, 211, 238, 0.6)'
                    }}>
                        🦊
                    </div>

                    {/* Stack */}
                    <div style={{
                        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                        border: '3px solid #22d3ee',
                        borderRadius: 12,
                        padding: '8px 20px',
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#000',
                        boxShadow: '0 0 20px rgba(34, 211, 238, 0.5)'
                    }}>
                        Hero<br />45 BB
                    </div>

                    {/* Dealer Button */}
                    <div style={{
                        position: 'absolute',
                        top: -10,
                        right: -10,
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#fff',
                        border: '3px solid #000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        fontWeight: 700,
                        color: '#000'
                    }}>
                        D
                    </div>
                </div>
            </>
        );
    }

    function renderActionButton(label, color) {
        return (
            <button
                onClick={() => setSelectedAction(label)}
                style={{
                    background: `linear-gradient(135deg, ${color}, ${adjustColor(color, -20)})`,
                    border: selectedAction === label ? '3px solid #22d3ee' : '3px solid transparent',
                    borderRadius: 12,
                    padding: '20px',
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: selectedAction === label
                        ? '0 0 20px rgba(34, 211, 238, 0.6)'
                        : '0 4px 12px rgba(0,0,0,0.3)',
                    transform: selectedAction === label ? 'scale(1.05)' : 'scale(1)'
                }}
                onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.target.style.transform = selectedAction === label ? 'scale(1.05)' : 'scale(1)'}
            >
                {label}
            </button>
        );
    }

    function adjustColor(color, amount) {
        return color; // Simplified for now
    }
}
