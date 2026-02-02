/* ═══════════════════════════════════════════════════════════════════════════
   COPY BUTTON — Copy Jarvis message to clipboard
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface CopyButtonProps {
    content: string;
    onCopy?: () => void;
}

export function CopyButton({ content, onCopy }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            onCopy?.();

            // Reset after 2 seconds
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    return (
        <button
            onClick={handleCopy}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: copied
                    ? 'rgba(0, 212, 255, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                border: copied
                    ? '1px solid rgba(0, 212, 255, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: copied ? '#00d4ff' : 'rgba(255, 255, 255, 0.6)',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
                if (!copied) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                }
            }}
            onMouseLeave={(e) => {
                if (!copied) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }
            }}
        >
            {copied ? (
                <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    <span>Copied!</span>
                </>
            ) : (
                <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                    </svg>
                    <span>Copy</span>
                </>
            )}
        </button>
    );
}
