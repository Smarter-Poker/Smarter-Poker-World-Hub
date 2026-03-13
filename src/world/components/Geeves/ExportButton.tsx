/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT BUTTON — Copy conversation as markdown or share
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface Message {
    id: string;
    content: string;
    isUser: boolean;
    timestamp: Date;
}

interface ExportButtonProps {
    messages: Message[];
}

export function ExportButton({ messages }: ExportButtonProps) {
    const [copied, setCopied] = useState(false);

    const exportAsMarkdown = () => {
        if (messages.length === 0) return;

        const lines = [
            '# Geeves Conversation',
            `Exported: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
            '',
            '---',
            '',
        ];

        for (const msg of messages) {
            const speaker = msg.isUser ? '**You**' : '**Geeves**';
            const time = new Date(msg.timestamp).toLocaleTimeString();
            lines.push(`### ${speaker} (${time})`);
            lines.push('');
            lines.push(msg.content);
            lines.push('');
            lines.push('---');
            lines.push('');
        }

        lines.push('*Exported from Smarter.Poker*');

        const markdown = lines.join('\n');

        navigator.clipboard.writeText(markdown).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = markdown;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    if (messages.length === 0) return null;

    return (
        <button
            onClick={exportAsMarkdown}
            title="Export conversation as markdown"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: copied ? 'rgba(0, 200, 100, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${copied ? 'rgba(0, 200, 100, 0.4)' : 'rgba(255, 255, 255, 0.15)'}`,
                borderRadius: '8px',
                color: copied ? '#00c864' : 'rgba(255, 255, 255, 0.7)',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
            }}
        >
            {copied ? '✓ Copied' : '📋 Export'}
        </button>
    );
}
