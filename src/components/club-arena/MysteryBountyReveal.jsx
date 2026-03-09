/**
 * MysteryBountyReveal — Animated envelope-open reveal overlay
 *
 * Shows when a mystery bounty is awarded during a running tournament.
 * Triggered by broadcast event or manual invocation.
 *
 * Props:
 *   reveal: { playerName, amount, tierLabel, isJackpot } | null
 *   onDismiss: () => void
 */
import { useState, useEffect, useRef } from 'react';

const FB = {
    bg: '#18191A', card: '#242526', text: '#E4E6EB', dim: '#B0B3B8',
    border: '#3E4042', gold: '#FFD700', danger: '#dc2626',
};

const TIER_COLORS = {
    min: '#6b7280',
    small: '#60a5fa',
    medium: '#34d399',
    large: '#fbbf24',
    huge: '#f97316',
    mega: '#ef4444',
    grand: '#a855f7',
    jackpot: '#FFD700',
};

function getTierFromAmount(amount, avgBounty) {
    if (!avgBounty || avgBounty <= 0) return { label: 'Prize', color: '#60a5fa' };
    const ratio = amount / avgBounty;
    if (ratio >= 50) return { label: 'JACKPOT', color: TIER_COLORS.jackpot };
    if (ratio >= 20) return { label: 'Grand Prize', color: TIER_COLORS.grand };
    if (ratio >= 10) return { label: 'Mega Prize', color: TIER_COLORS.mega };
    if (ratio >= 5) return { label: 'Huge Prize', color: TIER_COLORS.huge };
    if (ratio >= 2.5) return { label: 'Large Prize', color: TIER_COLORS.large };
    if (ratio >= 1.5) return { label: 'Medium Prize', color: TIER_COLORS.medium };
    if (ratio >= 0.5) return { label: 'Small Prize', color: TIER_COLORS.small };
    return { label: 'Min Prize', color: TIER_COLORS.min };
}

export default function MysteryBountyReveal({ reveal, onDismiss }) {
    const [phase, setPhase] = useState('idle'); // idle | envelope | reveal | done
    const timerRef = useRef(null);

    useEffect(() => {
        if (!reveal) { setPhase('idle'); return; }

        setPhase('envelope');

        // After 1.2s: flip to reveal
        const t1 = setTimeout(() => setPhase('reveal'), 1200);
        // After 5s: auto-dismiss
        const t2 = setTimeout(() => {
            setPhase('done');
            onDismiss?.();
        }, 5000);

        timerRef.current = [t1, t2];
        return () => { t1 && clearTimeout(t1); t2 && clearTimeout(t2); };
    }, [reveal]);

    if (!reveal || phase === 'idle' || phase === 'done') return null;

    const tier = reveal.tierLabel
        ? { label: reveal.tierLabel, color: TIER_COLORS[reveal.tierLabel.toLowerCase()] || '#60a5fa' }
        : getTierFromAmount(reveal.amount, reveal.avgBounty || reveal.amount);

    const isJackpot = reveal.isJackpot || tier.label === 'JACKPOT';
    const isBig = isJackpot || ['Grand Prize', 'Mega Prize', 'Huge Prize'].includes(tier.label);

    return (
        <div
            onClick={() => { setPhase('done'); onDismiss?.(); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 99999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.82)',
                animation: 'mystRevealBgIn 0.3s ease-out',
                cursor: 'pointer',
            }}
        >
            <style>{`
        @keyframes mystRevealBgIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mystEnvelopeShake {
          0%, 100% { transform: rotate(0deg) scale(1); }
          15% { transform: rotate(-5deg) scale(1.03); }
          30% { transform: rotate(5deg) scale(1.03); }
          45% { transform: rotate(-3deg) scale(1.01); }
          60% { transform: rotate(3deg) scale(1.01); }
          75% { transform: rotate(-1deg); }
        }
        @keyframes mystEnvelopeFlip {
          0% { transform: rotateY(0deg) scale(1); }
          50% { transform: rotateY(90deg) scale(1.1); }
          100% { transform: rotateY(360deg) scale(1); }
        }
        @keyframes mystRevealPop {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes mystGoldShimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes mystJackpotPulse {
          0%, 100% { box-shadow: 0 0 30px rgba(255,215,0,0.4); }
          50% { box-shadow: 0 0 60px rgba(255,215,0,0.8), 0 0 100px rgba(255,215,0,0.3); }
        }
      `}</style>

            <div style={{
                width: 280, textAlign: 'center',
                animation: phase === 'envelope' ? 'mystEnvelopeShake 0.8s ease-in-out infinite' : 'mystRevealPop 0.5s ease-out',
            }}>
                {phase === 'envelope' && (
                    <>
                        {/* Envelope */}
                        <div style={{
                            width: 180, height: 130, margin: '0 auto 20px',
                            background: 'linear-gradient(135deg, #9333ea, #7c3aed, #6d28d9)',
                            borderRadius: 12, position: 'relative',
                            boxShadow: '0 8px 40px rgba(147,51,234,0.5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            animation: 'mystEnvelopeFlip 1.2s ease-in-out forwards',
                        }}>
                            <span style={{ fontSize: 48 }}>✉️</span>
                            <div style={{
                                position: 'absolute', top: 6, right: 6,
                                fontSize: 10, color: '#fff', background: '#00000040',
                                padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                            }}>MYSTERY</div>
                        </div>
                        <div style={{ color: FB.dim, fontSize: 14, fontWeight: 600 }}>
                            Opening envelope for <strong style={{ color: FB.text }}>{reveal.playerName}</strong>...
                        </div>
                    </>
                )}

                {phase === 'reveal' && (
                    <>
                        {/* Prize Card */}
                        <div style={{
                            background: isBig
                                ? `linear-gradient(135deg, ${tier.color}30, ${FB.card}, ${tier.color}20)`
                                : FB.card,
                            borderRadius: 16, padding: '28px 24px',
                            border: `2px solid ${tier.color}`,
                            boxShadow: isJackpot ? undefined : `0 8px 40px ${tier.color}40`,
                            animation: isJackpot ? 'mystJackpotPulse 1.5s ease-in-out infinite' : undefined,
                            position: 'relative', overflow: 'hidden',
                        }}>
                            {/* Gold shimmer overlay for big prizes */}
                            {isBig && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: `linear-gradient(90deg, transparent 30%, ${tier.color}15 50%, transparent 70%)`,
                                    backgroundSize: '200% 100%',
                                    animation: 'mystGoldShimmer 2s linear infinite',
                                    pointerEvents: 'none',
                                }} />
                            )}

                            <div style={{ fontSize: 11, color: tier.color, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>
                                🎭 {tier.label}
                            </div>

                            <div style={{ color: FB.text, fontSize: 14, marginBottom: 12 }}>
                                <strong>{reveal.playerName}</strong> reveals...
                            </div>

                            <div style={{
                                fontSize: isJackpot ? 42 : isBig ? 36 : 30,
                                fontWeight: 900, color: tier.color,
                                textShadow: isBig ? `0 0 20px ${tier.color}60` : 'none',
                                marginBottom: 8,
                            }}>
                                {reveal.amount.toLocaleString()}
                            </div>

                            <div style={{ fontSize: 12, color: FB.dim }}>chips bounty awarded</div>
                        </div>

                        <div style={{ marginTop: 12, fontSize: 11, color: FB.dim }}>
                            Tap anywhere to dismiss
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
