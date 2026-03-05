/**
 * NEW USER WELCOME MODAL
 * Premium popup announcing the Welcome Package (500 💎 + 30-Day VIP)
 * Futuristic Metal design — shown once on first login
 *
 * ═══════════════════════════════════════════════════════════════════════
 * March 5, 2026 — Created for the New User Welcome Package feature.
 * Shows 500 diamonds + 30-day VIP announcement. Persisted via
 * localStorage so it only appears once per user account.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { Diamond, Crown, Zap, Sparkles, ChevronRight } from 'lucide-react';

const ANIM = `
    @keyframes welcomeFadeIn { from { opacity:0; transform:scale(0.9) translateY(20px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
    @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes pulse { 0%,100% { transform: scale(1); opacity:1; } 50% { transform: scale(1.08); opacity:0.85; } }
    @keyframes sparkle { 0%,100% { opacity:0.4; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.2); } }
    @keyframes goldGlow { 0%,100% { box-shadow: 0 0 20px rgba(247,185,40,0.3); } 50% { box-shadow: 0 0 40px rgba(247,185,40,0.5); } }
`;

export default function NewUserWelcomeModal({ isOpen, onClose, userName }) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Slight delay for dramatic entrance
            setTimeout(() => setIsVisible(true), 100);
        }
    }, [isOpen]);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(onClose, 300);
    };

    if (!isOpen) return null;

    return (
        <>
            <style>{ANIM}</style>
            <div style={s.overlay}>
                <div style={{
                    ...s.modal,
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(20px)',
                    transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}>
                    {/* Top LED */}
                    <div style={s.topLed} />

                    {/* Decorative sparkles */}
                    <div style={{ ...s.sparkle, top: 20, left: 30, animationDelay: '0s' }}>✨</div>
                    <div style={{ ...s.sparkle, top: 40, right: 25, animationDelay: '0.5s' }}>💎</div>
                    <div style={{ ...s.sparkle, bottom: 80, left: 20, animationDelay: '1s' }}>⭐</div>
                    <div style={{ ...s.sparkle, bottom: 60, right: 30, animationDelay: '1.5s' }}>✨</div>

                    {/* Crown icon */}
                    <div style={s.crownRing}>
                        <Crown size={36} style={{ color: '#f7b928', filter: 'drop-shadow(0 0 10px rgba(247,185,40,0.6))' }} />
                    </div>

                    {/* Title */}
                    <h2 style={s.title}>WELCOME TO</h2>
                    <h1 style={s.brandName}>SMARTER.POKER</h1>
                    {userName && (
                        <p style={s.greeting}>Hey {userName}, you're in! 🎉</p>
                    )}

                    {/* Benefits Cards */}
                    <div style={s.benefitsContainer}>
                        {/* Diamond Bonus */}
                        <div style={s.benefitCard}>
                            <div style={s.benefitIconWrap}>
                                <Diamond size={28} style={{ color: '#00d4ff', animation: 'float 3s ease-in-out infinite' }} />
                            </div>
                            <div style={s.benefitValue}>500</div>
                            <div style={s.benefitLabel}>DIAMONDS</div>
                            <div style={s.benefitDesc}>In Your Account</div>
                        </div>

                        {/* VIP Card */}
                        <div style={{ ...s.benefitCard, ...s.benefitCardGold }}>
                            <div style={s.benefitIconWrap}>
                                <Crown size={28} style={{ color: '#f7b928', animation: 'float 3s ease-in-out infinite 0.5s' }} />
                            </div>
                            <div style={{ ...s.benefitValue, ...s.benefitValueGold }}>30-DAY</div>
                            <div style={{ ...s.benefitLabel, color: '#f7b928' }}>VIP CARD</div>
                            <div style={s.benefitDesc}>Free Membership</div>
                        </div>
                    </div>

                    {/* CTA */}
                    <button style={s.ctaBtn} onClick={handleClose}>
                        <Zap size={18} />
                        LET'S GO!
                        <ChevronRight size={18} />
                    </button>

                    <p style={s.footnote}>
                        Your VIP membership unlocks all premium features for 30 days
                    </p>
                </div>
            </div>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────
// STYLES — Futuristic Metal with gold accents
// ─────────────────────────────────────────────────────────────────────
const s = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: 16,
    },
    modal: {
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        background: 'linear-gradient(180deg, #1a2a3a 0%, #0d1520 60%, #18191a 100%)',
        border: '2px solid rgba(247,185,40,0.5)',
        borderRadius: 24,
        padding: '40px 28px 32px',
        textAlign: 'center',
        boxShadow: '0 0 80px rgba(0,0,0,0.8), 0 0 40px rgba(247,185,40,0.15)',
        overflow: 'hidden',
        animation: 'goldGlow 4s ease-in-out infinite',
    },
    topLed: {
        position: 'absolute',
        top: 0,
        left: '10%',
        right: '10%',
        height: 3,
        background: 'linear-gradient(90deg, transparent, #f7b928, transparent)',
        borderRadius: '0 0 3px 3px',
        boxShadow: '0 0 12px rgba(247,185,40,0.5)',
    },
    sparkle: {
        position: 'absolute',
        fontSize: 16,
        animation: 'sparkle 2s ease-in-out infinite',
        pointerEvents: 'none',
    },
    crownRing: {
        width: 80,
        height: 80,
        margin: '0 auto 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(247,185,40,0.1)',
        border: '2px solid rgba(247,185,40,0.4)',
        borderRadius: '50%',
        animation: 'pulse 3s ease-in-out infinite',
    },
    title: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: '0.3em',
        color: 'rgba(255,255,255,0.6)',
        margin: '0 0 4px',
    },
    brandName: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 26,
        fontWeight: 900,
        letterSpacing: '0.08em',
        background: 'linear-gradient(135deg, #f7b928, #ffd700, #f7b928)',
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: 'shimmer 3s linear infinite',
        margin: '0 0 8px',
    },
    greeting: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.7)',
        margin: '0 0 28px',
    },
    benefitsContainer: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 14,
        marginBottom: 28,
    },
    benefitCard: {
        position: 'relative',
        padding: '20px 12px 16px',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.1) 0%, rgba(0,212,255,0.03) 100%)',
        border: '2px solid rgba(0,212,255,0.3)',
        borderRadius: 16,
        overflow: 'hidden',
    },
    benefitCardGold: {
        background: 'linear-gradient(180deg, rgba(247,185,40,0.1) 0%, rgba(247,185,40,0.03) 100%)',
        border: '2px solid rgba(247,185,40,0.3)',
    },
    benefitIconWrap: {
        marginBottom: 8,
    },
    benefitValue: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 28,
        fontWeight: 900,
        background: 'linear-gradient(180deg, #ffffff, #00d4ff)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1.2,
    },
    benefitValueGold: {
        background: 'linear-gradient(180deg, #ffffff, #f7b928)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    benefitLabel: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: '#00d4ff',
        marginTop: 2,
    },
    benefitDesc: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.45)',
        marginTop: 6,
        letterSpacing: '0.05em',
    },
    ctaBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '16px 48px',
        background: 'linear-gradient(135deg, #f7b928 0%, #d4981a 100%)',
        border: 'none',
        borderRadius: 14,
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: '#000',
        cursor: 'pointer',
        boxShadow: '0 6px 24px rgba(247,185,40,0.4)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        marginBottom: 16,
    },
    footnote: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.35)',
        letterSpacing: '0.05em',
        maxWidth: 280,
        margin: '0 auto',
        lineHeight: 1.5,
    },
};
