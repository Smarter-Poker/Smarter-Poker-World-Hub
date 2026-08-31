/**
 * VIPGateModal — Premium Upgrade Prompt
 * ═══════════════════════════════════════════════════════════════════════════
 * Shows when a user hits a VIP-gated feature. Links to Diamond Store.
 * 
 * NOTE: This component is ready but not actively wired to any feature
 * until the platform owner approves the gate map.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useRouter } from 'next/router';

const T = {
    bg: '#0a0a0a',
    card: '#18191a',
    border: '#3E4042',
    text: '#E4E6EB',
    textSec: '#B0B3B8',
    gold: '#FFD700',
    accent: '#4facfe',
};

export default function VIPGateModal({ visible, onClose, featureName, featureConfig }) {
    const router = useRouter();

    if (!visible) return null;

    const dayPassCost = featureConfig?.cost || 25;
    const gateType = featureConfig?.gate || 'VIP';

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
            }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'linear-gradient(135deg, #1a1a3e, #0a0a2a)',
                    borderRadius: 20, padding: 32, maxWidth: 400, width: '100%',
                    border: `1px solid ${T.gold}44`,
                    boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 60px rgba(255,215,0,0.05)',
                    textAlign: 'center',
                }}
            >
                {/* Crown icon */}
                <div style={{
                    width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 32, boxShadow: '0 4px 20px rgba(255,215,0,0.3)',
                }}>
                    VIP
                </div>

                <h2 style={{
                    color: T.text, fontSize: 22, fontWeight: 800, margin: '0 0 8px',
                    letterSpacing: 0.5,
                }}>
                    Premium Feature
                </h2>

                <p style={{
                    color: T.textSec, fontSize: 14, lineHeight: 1.5, margin: '0 0 24px',
                }}>
                    <strong style={{ color: T.gold }}>{featureName}</strong> is a premium feature.
                    Upgrade to VIP for unlimited access to all premium features!
                </p>

                {/* VIP Option */}
                <button
                    onClick={() => { onClose(); router.push('/hub/diamond-store?tab=vip'); }}
                    style={{
                        width: '100%', padding: '14px 20px', borderRadius: 12,
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                        border: 'none', cursor: 'pointer', color: '#000',
                        fontSize: 15, fontWeight: 800, marginBottom: 10,
                        boxShadow: '0 4px 16px rgba(255,215,0,0.3)',
                    }}
                >
                    Get VIP Membership
                </button>

                {/* Day Pass Option (for DIAMOND/MIXED gates) */}
                {(gateType === 'DIAMOND' || gateType === 'MIXED') && (
                    <button
                        onClick={() => { onClose(); router.push('/hub/diamond-store'); }}
                        style={{
                            width: '100%', padding: '12px 20px', borderRadius: 12,
                            background: 'rgba(79,172,254,0.1)',
                            border: `1px solid ${T.accent}44`,
                            cursor: 'pointer', color: T.accent,
                            fontSize: 13, fontWeight: 700,
                        }}
                    >
                        Day Pass - {dayPassCost} Diamonds (24h)
                    </button>
                )}

                {/* Close */}
                <button
                    onClick={onClose}
                    style={{
                        width: '100%', padding: '10px', marginTop: 12,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: T.textSec, fontSize: 13,
                    }}
                >
                    Maybe Later
                </button>
            </div>
        </div>
    );
}
