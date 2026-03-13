/**
 * TournamentStoryCard — Visual story card for tournament milestone stories
 * Renders with poker-themed gradients, trophy icons, and tournament branding.
 * Used in the StoriesBar and as a share preview on my-status.
 */
import React from 'react';

const STORY_TYPE_CONFIG = {
    registered: {
        gradient: 'linear-gradient(135deg, #1877F2 0%, #0A5DC2 100%)',
        icon: '🏆',
        label: 'Registered',
        accent: '#1877F2'
    },
    chip_update: {
        gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
        icon: '🪙',
        label: 'Chip Update',
        accent: '#F59E0B'
    },
    itm: {
        gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        icon: '💰',
        label: 'In The Money',
        accent: '#10B981'
    },
    final_table: {
        gradient: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
        icon: '🔥',
        label: 'Final Table',
        accent: '#EF4444'
    },
    winner: {
        gradient: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 50%, #F59E0B 100%)',
        icon: '👑',
        label: 'Winner',
        accent: '#FBBF24'
    },
    bubble: {
        gradient: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
        icon: '😤',
        label: 'Bubble',
        accent: '#6366F1'
    },
    custom: {
        gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        icon: '🃏',
        label: 'Update',
        accent: '#3B82F6'
    }
};

export default function TournamentStoryCard({
    storyType = 'custom',
    tournamentName = '',
    content = '',
    chipCount,
    finishPosition,
    payoutAmount,
    authorName = '',
    authorAvatar = '',
    onClick,
    compact = false,
    style = {}
}) {
    const config = STORY_TYPE_CONFIG[storyType] || STORY_TYPE_CONFIG.custom;

    const formatChips = (n) => {
        if (!n) return '0';
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${Math.floor(n / 1000)}K`;
        return n.toLocaleString();
    };

    if (compact) {
        // Compact version for StoriesBar ring
        return (
            <div
                onClick={onClick}
                style={{
                    width: 110,
                    height: 160,
                    borderRadius: 12,
                    background: config.gradient,
                    position: 'relative',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: `2px solid ${config.accent}`,
                    ...style
                }}
            >
                {/* Tournament badge */}
                <div style={{
                    position: 'absolute', top: 8, left: 8, right: 8,
                    fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.9)',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                    {config.label}
                </div>

                {/* Center icon */}
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: 36
                }}>
                    {config.icon}
                </div>

                {/* Bottom info */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '24px 8px 8px',
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))'
                }}>
                    {authorAvatar ? (
                        <img src={authorAvatar} alt="" style={{
                            width: 24, height: 24, borderRadius: '50%',
                            border: '2px solid #fff', marginBottom: 4
                        }} />
                    ) : authorName ? (
                        <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'rgba(255,255,255,0.2)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, color: '#fff', marginBottom: 4
                        }}>
                            {authorName.charAt(0).toUpperCase()}
                        </div>
                    ) : null}
                    <div style={{
                        fontSize: 10, fontWeight: 600, color: '#fff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                        {tournamentName || 'Tournament'}
                    </div>
                </div>
            </div>
        );
    }

    // Full-size story card (for story viewer / share preview)
    return (
        <div
            onClick={onClick}
            style={{
                width: '100%',
                maxWidth: 400,
                aspectRatio: '9/16',
                borderRadius: 20,
                background: config.gradient,
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: onClick ? 'pointer' : 'default',
                ...style
            }}
        >
            {/* Top badge */}
            <div style={{
                position: 'absolute', top: 20, left: 0, right: 0,
                textAlign: 'center'
            }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 16px', borderRadius: 20,
                    background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)',
                    fontSize: 12, fontWeight: 700, color: '#fff',
                    textTransform: 'uppercase', letterSpacing: '1px'
                }}>
                    {config.icon} {config.label}
                </div>
            </div>

            {/* Center content */}
            <div style={{
                textAlign: 'center', padding: '0 24px',
                maxWidth: '100%'
            }}>
                {/* Big icon */}
                <div style={{ fontSize: 64, marginBottom: 16 }}>
                    {config.icon}
                </div>

                {/* Tournament name */}
                <h2 style={{
                    fontSize: 20, fontWeight: 800, color: '#fff',
                    margin: '0 0 12px', textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    wordWrap: 'break-word'
                }}>
                    {tournamentName}
                </h2>

                {/* Content text */}
                {content && (
                    <p style={{
                        fontSize: 16, color: 'rgba(255,255,255,0.9)',
                        margin: '0 0 16px', lineHeight: 1.4,
                        textShadow: '0 1px 4px rgba(0,0,0,0.2)',
                        wordWrap: 'break-word'
                    }}>
                        {content}
                    </p>
                )}

                {/* Stats row */}
                <div style={{
                    display: 'flex', gap: 16, justifyContent: 'center',
                    flexWrap: 'wrap'
                }}>
                    {chipCount && (
                        <div style={{
                            padding: '8px 16px', borderRadius: 12,
                            background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)'
                        }}>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Chips</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>
                                {formatChips(chipCount)}
                            </div>
                        </div>
                    )}
                    {finishPosition && (
                        <div style={{
                            padding: '8px 16px', borderRadius: 12,
                            background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)'
                        }}>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Finished</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
                                {addOrdinal(finishPosition)}
                            </div>
                        </div>
                    )}
                    {payoutAmount > 0 && (
                        <div style={{
                            padding: '8px 16px', borderRadius: 12,
                            background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)'
                        }}>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Won</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981' }}>
                                ${payoutAmount.toLocaleString()}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom author */}
            {authorName && (
                <div style={{
                    position: 'absolute', bottom: 20, left: 0, right: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}>
                    {authorAvatar ? (
                        <img src={authorAvatar} alt="" style={{
                            width: 28, height: 28, borderRadius: '50%',
                            border: '2px solid rgba(255,255,255,0.5)'
                        }} />
                    ) : (
                        <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'rgba(255,255,255,0.2)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700, color: '#fff'
                        }}>
                            {authorName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <span style={{
                        fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)'
                    }}>
                        {authorName}
                    </span>
                </div>
            )}

            {/* Powered by badge */}
            <div style={{
                position: 'absolute', bottom: 8, right: 12,
                fontSize: 8, color: 'rgba(255,255,255,0.2)',
                letterSpacing: '0.5px'
            }}>
                Smarter.Poker
            </div>
        </div>
    );
}

function addOrdinal(n) {
    if (!n) return '';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export { STORY_TYPE_CONFIG };
