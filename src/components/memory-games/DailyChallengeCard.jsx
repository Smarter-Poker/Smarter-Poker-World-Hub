import React from 'react';
function DailyChallengeCard({ challenge, streak, completed, onPlay, loading }) {
    if (loading) {
        return (
            <div style={{
                background: 'linear-gradient(135deg, rgba(255, 107, 0, 0.1), rgba(255, 0, 102, 0.1))',
                borderRadius: 16,
                padding: 24,
                marginBottom: 24,
                border: '1px solid rgba(255, 107, 0, 0.3)',
                textAlign: 'center',
            }}>
                <div style={{ color: 'rgba(255,255,255,0.5)' }}>Loading Daily Challenge...</div>
            </div>
        );
    }

    if (!challenge) return null;

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(255, 107, 0, 0.15), rgba(255, 0, 102, 0.1))',
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            border: completed ? '2px solid #00ff88' : '2px solid rgba(255, 107, 0, 0.5)',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Streak Badge */}
            {streak?.current_streak > 0 && (
                <div style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    borderRadius: 20,
                    padding: '6px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                }}>
                    <span style={{ fontSize: 16, color: '#FF6B00' }}>★</span>
                    <span style={{ fontWeight: 700, color: '#000', fontSize: 14 }}>
                        {streak.current_streak} day streak
                    </span>
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: completed ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 107, 0, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                }}>
                    {completed ? '✓' : '◉'}
                </div>
                <div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Daily Challenge
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                        {challenge.title || `Level ${challenge.level || 1} Challenge`}
                    </div>
                </div>
            </div>

            <div style={{
                display: 'flex',
                gap: 16,
                marginBottom: 16,
                flexWrap: 'wrap',
            }}>
                <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 8,
                    padding: '8px 14px',
                }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Mode</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{challenge.game_mode || 'Range'}</div>
                </div>
                <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 8,
                    padding: '8px 14px',
                }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Target</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#FFD700' }}>{challenge.target_accuracy || 75}% accuracy</div>
                </div>
                <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 8,
                    padding: '8px 14px',
                }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Reward</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#00ff88' }}>+{challenge.diamond_reward || 50} Diamonds</div>
                </div>
            </div>

            {completed ? (
                <div style={{
                    background: 'rgba(0, 255, 136, 0.2)',
                    borderRadius: 10,
                    padding: '12px 20px',
                    textAlign: 'center',
                    color: '#00ff88',
                    fontWeight: 700,
                }}>
                    ✓ Challenge Completed Today!
                </div>
            ) : (
                <button
                    onClick={onPlay}
                    style={{
                        width: '100%',
                        padding: '14px 24px',
                        background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
                        border: 'none',
                        borderRadius: 12,
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    Play Daily Challenge
                </button>
            )}
        </div>
    );
}
export default DailyChallengeCard;
