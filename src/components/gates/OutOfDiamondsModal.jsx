import React from 'react';
function OutOfDiamondsModal({ isOpen, onClose, gameCost = 5, isVIP = false }) {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
        }}>
            <div style={{
                background: 'linear-gradient(135deg, #1a0a2a, #0a0a12)',
                borderRadius: 24,
                padding: 32,
                maxWidth: 420,
                width: '90%',
                textAlign: 'center',
                border: '2px solid rgba(255, 107, 0, 0.5)',
                boxShadow: '0 0 60px rgba(255, 107, 0, 0.3)',
            }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}><svg width='64' height='64' viewBox='0 0 24 24' fill='none'><path d='M12 2L2 9l10 13 10-13L12 2z' fill='#00D4FF' /><path d='M12 2L2 9h20L12 2z' fill='#00B8E6' /></svg></div>
                <h2 style={{
                    fontFamily: 'Rajdhani, sans-serif',
                    fontSize: 28,
                    fontWeight: 900,
                    color: '#ff6b00',
                    marginBottom: 8,
                }}>OUT OF DIAMONDS</h2>
                <p style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 16,
                    marginBottom: 24,
                    lineHeight: 1.6,
                }}>
                    You need <strong style={{ color: '#FFD700' }}>{gameCost} diamonds</strong> to play this game.
                </p>

                {!isVIP && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(0, 212, 255, 0.2))',
                        borderRadius: 16,
                        padding: 20,
                        marginBottom: 24,
                        border: '1px solid rgba(138, 43, 226, 0.3)',
                    }}>
                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                            GET VIP FOR
                        </div>
                        <div style={{
                            fontFamily: 'Rajdhani, sans-serif',
                            fontSize: 32,
                            fontWeight: 900,
                            color: '#fff',
                            marginBottom: 4,
                        }}>
                            $19.99<span style={{ fontSize: 16, opacity: 0.7 }}>/month</span>
                        </div>
                        <div style={{ color: '#00ff88', fontSize: 14, fontWeight: 600 }}>
                            UNLIMITED ACCESS • No diamonds needed
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 12 }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1,
                            padding: '14px 24px',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Maybe Later
                    </button>
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a
                        href="/hub/diamond-store?tab=vip"
                        style={{
                            flex: 1,
                            padding: '14px 24px',
                            background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        Get Diamonds
                    </a>
                </div>
            </div>
        </div>
    );
}
export default OutOfDiamondsModal;
