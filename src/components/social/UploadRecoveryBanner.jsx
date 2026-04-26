/**
 * 🔄 UploadRecoveryBanner
 * Shows a banner when a previous video upload was interrupted (user navigated away).
 * Detects dangling upload intents from sessionStorage and offers to dismiss.
 */

import React, { useState, useEffect } from 'react';
import bgUpload from '../../lib/backgroundVideoUpload';

const SOCIAL_COLORS = {
    text: '#1c1e21',
    textSec: '#65676B',
    blue: '#1877F2',
    border: '#E4E6EB',
    card: '#FFFFFF',
    warning: '#FFF3E0',
    warningBorder: '#FFB74D',
};

export default function UploadRecoveryBanner() {
    const [intent, setIntent] = useState(null);

    useEffect(() => {
        // Check for a dangling upload intent from a previous session
        const dangling = bgUpload.checkDanglingIntent();
        if (dangling) {
            setIntent(dangling);
        }
    }, []);

    if (!intent) return null;

    const sizeMB = Math.round((intent.fileSize || 0) / (1024 * 1024));
    const fileName = intent.fileName || 'video';
    const ageMinutes = Math.round((Date.now() - intent.timestamp) / 60000);

    return (
        <div style={{
            background: SOCIAL_COLORS.warning,
            border: `1px solid ${SOCIAL_COLORS.warningBorder}`,
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'fadeInDown 0.3s ease',
        }}>
            {/* Warning icon */}
            <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: '#FF9800', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="0">
                    <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
                </svg>
            </div>

            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: SOCIAL_COLORS.text }}>
                    Previous Upload Interrupted
                </div>
                <div style={{ fontSize: 12, color: SOCIAL_COLORS.textSec, marginTop: 2 }}>
                    {fileName} ({sizeMB}MB) was interrupted {ageMinutes}m ago. Select your video again to re-upload.
                </div>
            </div>

            {/* Dismiss */}
            <button
                onClick={() => {
                    bgUpload.clearDanglingIntent();
                    setIntent(null);
                }}
                style={{
                    background: 'transparent', border: 'none',
                    color: SOCIAL_COLORS.textSec, cursor: 'pointer',
                    padding: 4, flexShrink: 0,
                }}
                aria-label="Dismiss recovery banner"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>

            <style>{`
                @keyframes fadeInDown {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
