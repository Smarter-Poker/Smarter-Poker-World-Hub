/**
 * TranscodeStatusBadge
 * A compact badge/overlay that shows when a video post is being transcoded.
 * Renders a small "Processing Video..." indicator on video post cards.
 *
 * Usage:
 *   <TranscodeStatusBadge postId={post.id} mediaType={post.media_type} />
 *   Renders nothing if not a video or transcoding is not active.
 */

import React from 'react';
import { useTranscodeStatus } from '../../hooks/useTranscodeStatus';

export default function TranscodeStatusBadge({ postId, mediaType }) {
    const isVideoPost = mediaType === 'video';
    const { isProcessing, status, progress } = useTranscodeStatus(postId, isVideoPost);

    if (!isProcessing) return null;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: 'linear-gradient(90deg, #EDE9FE, #E0F2FE)',
            borderBottom: '1px solid #E4E6EB',
            fontSize: 13,
            color: '#4338CA',
            fontWeight: 600,
        }}>
            {/* Spinner */}
            <div style={{
                width: 14, height: 14,
                border: '2px solid #C7D2FE',
                borderTopColor: '#4338CA',
                borderRadius: '50%',
                animation: 'transcodeSpin 0.8s linear infinite',
                flexShrink: 0,
            }} />
            <span>
                {status === 'queued'
                    ? 'Video queued for processing...'
                    : `Processing video${progress > 0 ? ` (${progress}%)` : '...'}`
                }
            </span>
            <style>{`
                @keyframes transcodeSpin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
