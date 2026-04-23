/**
 * 👻 GHOST POST CARD
 * src/components/social/GhostPostCard.jsx
 *
 * Renders an optimistic "uploading" placeholder at the top of the feed
 * while a video upload is in progress. Shows:
 *   - User avatar + name
 *   - Blurred video thumbnail (from Object URL)
 *   - Circular progress ring with percentage
 *   - Status label ("Uploading… 42%", "Saving post…", etc.)
 *   - Error state with retry option
 */

import React, { useState, useEffect } from 'react';
import ghostPost from '../../stores/ghostPostStore';
import { SP_COLORS, SPAvatar } from './SmarterPokerStyleCard';

const GhostPostCard = () => {
    const [ghost, setGhost] = useState(ghostPost.current);

    useEffect(() => {
        return ghostPost.subscribe(setGhost);
    }, []);

    if (!ghost) return null;

    const isError = ghost.status === 'error';
    const progress = ghost.progress || 0;
    const circumference = 2 * Math.PI * 22; // r=22 for the SVG circle
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <div style={styles.card}>
            {/* Header */}
            <div style={styles.header}>
                <SPAvatar src={ghost.user?.avatar} size={40} />
                <div style={styles.headerText}>
                    <span style={styles.authorName}>{ghost.user?.name || 'You'}</span>
                    <span style={styles.timestamp}>Just now · Uploading…</span>
                </div>
            </div>

            {/* Caption */}
            {ghost.content && (
                <p style={styles.caption}>{ghost.content}</p>
            )}

            {/* Video Preview with Progress Overlay */}
            <div style={styles.previewContainer}>
                {/* Blurred thumbnail */}
                {ghost.videoPreviewUrl && (
                    <video
                        src={ghost.videoPreviewUrl}
                        style={styles.previewVideo}
                        muted
                        playsInline
                        preload="metadata"
                    />
                )}

                {/* Dark overlay */}
                <div style={styles.overlay} />

                {/* Progress Ring */}
                <div style={styles.progressCenter}>
                    {isError ? (
                        <div style={styles.errorIcon}>✕</div>
                    ) : (
                        <svg width="56" height="56" style={styles.progressRing}>
                            {/* Background circle */}
                            <circle
                                cx="28" cy="28" r="22"
                                fill="none"
                                stroke="rgba(255,255,255,0.2)"
                                strokeWidth="3"
                            />
                            {/* Progress arc */}
                            <circle
                                cx="28" cy="28" r="22"
                                fill="none"
                                stroke={isError ? '#ff4444' : '#00d4ff'}
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                style={{
                                    transform: 'rotate(-90deg)',
                                    transformOrigin: '50% 50%',
                                    transition: 'stroke-dashoffset 0.3s ease',
                                }}
                            />
                            {/* Percentage text */}
                            <text
                                x="28" y="28"
                                textAnchor="middle"
                                dominantBaseline="central"
                                fill="white"
                                fontSize="13"
                                fontWeight="700"
                                fontFamily="Inter, system-ui, sans-serif"
                            >
                                {progress}%
                            </text>
                        </svg>
                    )}

                    {/* Status label */}
                    <span style={{
                        ...styles.statusLabel,
                        color: isError ? '#ff6b6b' : 'rgba(255,255,255,0.9)',
                    }}>
                        {ghost.label || 'Uploading…'}
                    </span>
                </div>
            </div>

            {/* Pulsing border animation */}
            <style>{`
                @keyframes ghost-pulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.2); }
                    50% { box-shadow: 0 0 0 4px rgba(0, 212, 255, 0.1); }
                }
                @keyframes ghost-shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
            `}</style>
        </div>
    );
};

const styles = {
    card: {
        background: SP_COLORS.bgWhite || '#242526',
        borderRadius: 8,
        marginBottom: 16,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        animation: 'ghost-pulse 2s ease-in-out infinite',
        border: '1px solid rgba(0, 212, 255, 0.15)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px 8px',
    },
    headerText: {
        display: 'flex',
        flexDirection: 'column',
    },
    authorName: {
        fontWeight: 600,
        fontSize: 15,
        color: SP_COLORS.textPrimary,
    },
    timestamp: {
        fontSize: 13,
        color: SP_COLORS.textSecondary,
        opacity: 0.7,
    },
    caption: {
        padding: '0 16px 8px',
        margin: 0,
        fontSize: 15,
        color: SP_COLORS.textPrimary,
        lineHeight: 1.4,
    },
    previewContainer: {
        position: 'relative',
        width: '100%',
        minHeight: 200,
        maxHeight: 300,
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        overflow: 'hidden',
    },
    previewVideo: {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        filter: 'blur(8px) brightness(0.4)',
        transform: 'scale(1.1)', // prevent blur edges from showing
    },
    overlay: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
    },
    progressCenter: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    progressRing: {
        filter: 'drop-shadow(0 0 8px rgba(0, 212, 255, 0.3))',
    },
    statusLabel: {
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.02em',
        textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    },
    errorIcon: {
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: '3px solid #ff4444',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        color: '#ff4444',
        fontWeight: 700,
    },
};

export default GhostPostCard;
