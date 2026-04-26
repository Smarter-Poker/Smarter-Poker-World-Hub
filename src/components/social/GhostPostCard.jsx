/**
 * 🔮 GHOST POST PLACEHOLDER
 * src/components/social/GhostPostCard.jsx
 *
 * Displays an "uploading" placeholder card at the top of the feed
 * when a video upload goes to background mode. Shows live progress,
 * thumbnail preview, and the user's pending caption.
 *
 * Subscribes to bgUpload events and auto-removes on completion or error.
 */
import React, { useState, useEffect } from 'react';
import bgUpload from '../../lib/backgroundVideoUpload';

const SOCIAL_COLORS = {
    bg: '#FFFFFF',
    card: '#FFFFFF',
    text: '#1C1E21',
    textSec: '#65676B',
    border: '#E4E6EB',
    blue: '#1877F2',
};

export default function GhostPostCard({ user }) {
    const [visible, setVisible] = useState(false);
    const [progress, setProgress] = useState(0);
    const [label, setLabel] = useState('Uploading…');
    const [meta, setMeta] = useState(null); // { content, thumbnail, fileName }
    const [queueInfo, setQueueInfo] = useState(null); // { position, total }

    useEffect(() => {
        const unsub = bgUpload.subscribe({
            onProgress: ({ pct, label: lbl, state, queuePosition, queueTotal }) => {
                if (state === 'background') {
                    setVisible(true);
                    setProgress(pct);
                    setLabel(lbl);
                    if (queueTotal > 1) setQueueInfo({ position: queuePosition, total: queueTotal });
                    if (!meta && bgUpload.ghostMeta) {
                        setMeta(bgUpload.ghostMeta);
                    }
                }
            },
            onGhostPost: (ghostMeta) => {
                setVisible(true);
                setMeta(ghostMeta);
            },
            onComplete: () => {
                // Brief "complete" flash then fade out
                setLabel('Upload Complete!');
                setProgress(100);
                setTimeout(() => setVisible(false), 2000);
            },
            onError: () => {
                setLabel('Upload Failed');
                setTimeout(() => setVisible(false), 3000);
            },
        });

        // Check if already in background mode on mount
        if (bgUpload.isActive && bgUpload.state === 'background') {
            setVisible(true);
            setProgress(bgUpload.progress);
            setLabel(bgUpload.label);
            if (bgUpload.ghostMeta) setMeta(bgUpload.ghostMeta);
        }

        return unsub;
    }, []);

    if (!visible) return null;

    const displayName = user?.name || 'You';
    const avatarUrl = user?.avatar;
    const content = meta?.content || '';
    const thumbnail = meta?.thumbnail;
    const isComplete = progress >= 100;
    const isFailed = label === 'Upload Failed';

    return (
        <div style={{
            background: SOCIAL_COLORS.card,
            borderRadius: 8,
            border: `1px solid ${SOCIAL_COLORS.border}`,
            marginBottom: 16,
            overflow: 'hidden',
            opacity: isComplete ? 0.6 : 1,
            transition: 'opacity 0.5s ease',
            animation: 'uploadPulse 2s ease-in-out infinite',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px',
                position: 'relative',
            }}>
                {avatarUrl ? (
                    <img
                        src={avatarUrl}
                        alt={displayName}
                        style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                    />
                ) : (
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #1877F2, #42B72A)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 700, fontSize: 16,
                    }}>
                        {displayName[0]?.toUpperCase()}
                    </div>
                )}
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: SOCIAL_COLORS.text }}>
                        {displayName}
                    </div>
                    <div style={{
                        fontSize: 12, color: SOCIAL_COLORS.blue, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: isFailed ? '#FA383E' : isComplete ? '#42B72A' : SOCIAL_COLORS.blue,
                            animation: isComplete || isFailed ? 'none' : 'uploadPulse 1s ease-in-out infinite',
                        }} />
                        {isComplete ? 'Posted!' : isFailed ? 'Failed' : queueInfo ? `Uploading Video ${queueInfo.position} of ${queueInfo.total}…` : 'Uploading Video…'}
                    </div>
                </div>
                {/* Cancel button */}
                {!isComplete && !isFailed && (
                    <button
                        onClick={() => { bgUpload.abort(); setVisible(false); }}
                        style={{
                            background: 'rgba(0,0,0,0.05)', border: 'none',
                            borderRadius: '50%', width: 32, height: 32,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: SOCIAL_COLORS.textSec, fontSize: 14,
                            flexShrink: 0,
                        }}
                        aria-label="Cancel upload"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Caption */}
            {content && (
                <div style={{
                    padding: '0 16px 8px',
                    fontSize: 14,
                    color: SOCIAL_COLORS.text,
                    lineHeight: 1.4,
                }}>
                    {content.length > 200 ? content.slice(0, 200) + '…' : content}
                </div>
            )}

            {/* Thumbnail or placeholder */}
            <div style={{
                width: '100%',
                aspectRatio: '16/9',
                background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {thumbnail ? (
                    <img
                        src={thumbnail}
                        alt="Video thumbnail"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
                    />
                ) : (
                    <div style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="rgba(255,255,255,0.2)">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                )}

                {/* Progress overlay */}
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '12px 16px',
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                }}>
                    {/* Progress bar */}
                    <div style={{
                        height: 4,
                        borderRadius: 2,
                        background: 'rgba(255,255,255,0.2)',
                        overflow: 'hidden',
                        marginBottom: 6,
                    }}>
                        <div style={{
                            height: '100%',
                            borderRadius: 2,
                            background: isFailed
                                ? '#FA383E'
                                : 'linear-gradient(90deg, #1877F2, #42B72A)',
                            width: `${Math.min(progress, 100)}%`,
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                    <div style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.9)',
                        fontWeight: 600,
                        textAlign: 'center',
                    }}>
                        {label}
                    </div>
                </div>
            </div>
        </div>
    );
}
